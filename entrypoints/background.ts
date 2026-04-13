import {
  CONTEXT_MENU_ID,
  EMBEDDING_MODEL,
  SCAN_BATCH_SIZE,
  X_HOST_MATCHES,
} from '@/lib/constants';
import {
  bumpCacheRevision,
  bumpLibraryRevision,
  bumpSettingsRevision,
  getRuntimeState,
  getSettings,
  saveSettings,
  updateRuntimeState,
} from '@/lib/settings';
import {
  clearEmbeddingCache,
  clearMutedImages,
  clearUrlHashLookup,
  countEmbeddingCache,
  countMutedImages,
  deleteMutedImage,
  getEmbeddingCacheBySha256,
  getMutedImageById,
  getMutedImageBySha256,
  getUrlHashLookup,
  listMutedImages,
  putEmbeddingCache,
  putMutedImage,
  putUrlHashLookup,
} from '@/lib/db';
import {
  arrayBufferToBase64,
  buildCandidateKey,
  detectImageMimeType,
  normalizeMediaUrl,
  sha256Hex,
} from '@/lib/media';
import { geminiEmbeddingClient } from '@/lib/gemini';
import { cosineSimilarity } from '@/lib/vector';
import type {
  EmbeddingCacheEntry,
  FetchedImage,
  MutedImageRecord,
  OptionsState,
  PreparedCandidate,
  RuntimeMessage,
  ScanCandidate,
  ScanDecision,
  ScanResponse,
  UserSettings,
} from '@/lib/types';

const inFlightImageFetches = new Map<string, Promise<FetchedImage>>();

export default defineBackground({
  main() {
    void createContextMenu();

    browser.runtime.onInstalled.addListener(() => {
      void createContextMenu();
    });

    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId !== CONTEXT_MENU_ID || !info.srcUrl) {
        return;
      }

      void handleContextMenuMute(info.srcUrl, info.pageUrl ?? tab?.url ?? '', tab?.id);
    });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      void Promise.resolve(handleRuntimeMessage(message as RuntimeMessage))
        .then((result) => {
          sendResponse({
            ok: true,
            data: result,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: formatError(error),
          });
        });

      return true;
    });
  },
});

async function createContextMenu() {
  await browser.contextMenus.removeAll();
  await browser.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Mute similar images',
    contexts: ['image'],
    documentUrlPatterns: X_HOST_MATCHES,
    targetUrlPatterns: ['https://pbs.twimg.com/media/*'],
  });
}

async function handleRuntimeMessage(message: RuntimeMessage) {
  switch (message.type) {
    case 'SCAN_POST_IMAGES':
      return handleScanPostImages(message.candidates);
    case 'UNDO_LAST_MUTE':
      return handleUndoLastMute();
    case 'OPTIONS_GET_STATE':
      return getOptionsState();
    case 'OPTIONS_VALIDATE_AND_SAVE_SETTINGS':
      return handleValidateAndSaveSettings(message.settings);
    case 'OPTIONS_RESET_MUTED_LIBRARY':
      return handleResetMutedLibrary();
    case 'OPTIONS_CLEAR_SCAN_CACHE':
      return handleClearScanCache();
    case 'CONTENT_SHOW_UNDO_TOAST':
      return undefined;
  }
}

async function handleContextMenuMute(
  mediaUrl: string,
  pageUrl: string,
  tabId?: number,
) {
  try {
    const result = await muteImage(mediaUrl, pageUrl);
    if (!tabId) {
      return;
    }

    await browser.tabs.sendMessage(tabId, {
      type: 'CONTENT_SHOW_UNDO_TOAST',
      mutedImageId: result.mutedImageId,
      mediaUrl: result.mediaUrl,
      message: result.alreadyMuted
        ? 'Image was already muted.'
        : 'Muted image. Similar tweets will now be hidden.',
    } satisfies RuntimeMessage);
  } catch (error) {
    if (!tabId) {
      return;
    }

    await browser.tabs
      .sendMessage(tabId, {
        type: 'CONTENT_SHOW_UNDO_TOAST',
        mutedImageId: null,
        message: formatError(error),
      } satisfies RuntimeMessage)
      .catch(() => undefined);
  }
}

async function muteImage(mediaUrl: string, pageUrl: string) {
  const settings = await requireActiveSettings();
  const image = await prepareImage(mediaUrl);
  const existing = await getMutedImageBySha256(image.sha256);

  if (existing) {
    await updateRuntimeState((current) => ({
      ...current,
      lastMutedImageId: existing.id,
    }));
    return {
      mutedImageId: existing.id,
      mediaUrl: image.normalizedMediaUrl,
      alreadyMuted: true,
    };
  }

  const [embedding] = await geminiEmbeddingClient.embedImages(settings.apiKey, [
    {
      mimeType: image.mimeType,
      base64Data: image.base64Data,
    },
  ]);

  const createdAt = new Date().toISOString();
  const record: MutedImageRecord = {
    id: crypto.randomUUID(),
    createdAt,
    sourcePageUrl: pageUrl,
    mediaUrl: image.normalizedMediaUrl,
    sha256: image.sha256,
    mimeType: image.mimeType,
    embedding,
  };

  await Promise.all([
    putMutedImage(record),
    putEmbeddingCache({
      sha256: image.sha256,
      mediaUrl: image.normalizedMediaUrl,
      mimeType: image.mimeType,
      embedding,
      lastSeenAt: createdAt,
    }),
    putUrlHashLookup({
      mediaUrl: image.normalizedMediaUrl,
      sha256: image.sha256,
      updatedAt: createdAt,
    }),
  ]);

  await Promise.all([
    bumpLibraryRevision({ lastMutedImageId: record.id }),
    bumpCacheRevision(),
  ]);

  return {
    mutedImageId: record.id,
    mediaUrl: image.normalizedMediaUrl,
    alreadyMuted: false,
  };
}

async function handleScanPostImages(
  candidates: ScanCandidate[],
): Promise<ScanResponse> {
  const uniqueCandidates = dedupeCandidates(candidates);
  if (!uniqueCandidates.length) {
    return {
      decisions: [],
      processedKeys: [],
    };
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    return {
      decisions: [],
      processedKeys: [],
      skippedReason: 'disabled',
    };
  }

  if (!settings.apiKey.trim()) {
    return {
      decisions: [],
      processedKeys: [],
      skippedReason: 'missing_api_key',
    };
  }

  const mutedImages = await listMutedImages();
  if (!mutedImages.length) {
    return {
      decisions: [],
      processedKeys: uniqueCandidates.map(buildCandidateKey),
      skippedReason: 'no_mutes',
    };
  }

  const decisions: ScanDecision[] = [];
  const processedKeys: string[] = [];
  const preparedCandidates: PreparedCandidate[] = [];
  const mutedBySha = new Map(mutedImages.map((record) => [record.sha256, record]));

  for (const candidate of uniqueCandidates) {
    const candidateKey = buildCandidateKey(candidate);
    const normalizedUrl = normalizeMediaUrl(candidate.mediaUrl);
    if (!normalizedUrl) {
      processedKeys.push(candidateKey);
      continue;
    }

    const lookup = await getUrlHashLookup(normalizedUrl);
    if (lookup) {
      const exactMuted = mutedBySha.get(lookup.sha256);
      if (exactMuted) {
        decisions.push({
          postId: candidate.postId,
          matchedMuteId: exactMuted.id,
          score: 1,
          action: 'hide_post',
        });
        processedKeys.push(candidateKey);
        continue;
      }

      const cachedEmbedding = await getEmbeddingCacheBySha256(lookup.sha256);
      if (cachedEmbedding) {
        maybePushDecision(
          decisions,
          candidate.postId,
          findBestMuteMatch(cachedEmbedding.embedding, mutedImages, settings.threshold),
        );
        processedKeys.push(candidateKey);
        continue;
      }
    }

    try {
      const image = await prepareImage(candidate.mediaUrl);
      await putUrlHashLookup({
        mediaUrl: image.normalizedMediaUrl,
        sha256: image.sha256,
        updatedAt: new Date().toISOString(),
      });

      const exactMuted = mutedBySha.get(image.sha256);
      if (exactMuted) {
        decisions.push({
          postId: candidate.postId,
          matchedMuteId: exactMuted.id,
          score: 1,
          action: 'hide_post',
        });
        processedKeys.push(candidateKey);
        continue;
      }

      const cachedEmbedding = await getEmbeddingCacheBySha256(image.sha256);
      if (cachedEmbedding) {
        maybePushDecision(
          decisions,
          candidate.postId,
          findBestMuteMatch(cachedEmbedding.embedding, mutedImages, settings.threshold),
        );
        processedKeys.push(candidateKey);
        continue;
      }

      preparedCandidates.push({
        candidate,
        key: candidateKey,
        image,
      });
    } catch (error) {
      console.warn('Unable to prepare media candidate for scanning.', error);
    }
  }

  let wroteCache = false;
  for (let index = 0; index < preparedCandidates.length; index += SCAN_BATCH_SIZE) {
    const batch = preparedCandidates.slice(index, index + SCAN_BATCH_SIZE);

    try {
      const embeddings = await geminiEmbeddingClient.embedImages(
        settings.apiKey,
        batch.map(({ image }) => ({
          mimeType: image.mimeType,
          base64Data: image.base64Data,
        })),
      );

      await Promise.all(
        batch.map(async ({ candidate, key, image }, batchIndex) => {
          const embedding = embeddings[batchIndex];
          if (!embedding) {
            return;
          }

          const cacheEntry: EmbeddingCacheEntry = {
            sha256: image.sha256,
            mediaUrl: image.normalizedMediaUrl,
            mimeType: image.mimeType,
            embedding,
            lastSeenAt: new Date().toISOString(),
          };

          await putEmbeddingCache(cacheEntry);
          wroteCache = true;
          maybePushDecision(
            decisions,
            candidate.postId,
            findBestMuteMatch(embedding, mutedImages, settings.threshold),
          );
          processedKeys.push(key);
        }),
      );
    } catch (error) {
      console.warn('Gemini embedding batch failed; leaving candidates retryable.', error);
    }
  }

  if (wroteCache) {
    await bumpCacheRevision();
  }

  return {
    decisions: selectBestDecisions(decisions),
    processedKeys,
  };
}

async function handleUndoLastMute() {
  const runtimeState = await getRuntimeState();
  if (!runtimeState.lastMutedImageId) {
    return {
      ok: false,
      message: 'There is no recent mute to undo.',
    };
  }

  const existing = await getMutedImageById(runtimeState.lastMutedImageId);
  if (!existing) {
    await updateRuntimeState((current) => ({
      ...current,
      lastMutedImageId: null,
    }));
    return {
      ok: false,
      message: 'The last muted image no longer exists.',
    };
  }

  await deleteMutedImage(existing.id);
  await bumpLibraryRevision({
    lastMutedImageId: null,
  });

  return {
    ok: true,
    message: 'Removed the last muted image.',
    mutedImageId: existing.id,
  };
}

async function handleResetMutedLibrary() {
  await clearMutedImages();
  await bumpLibraryRevision({
    lastMutedImageId: null,
  });
  return getOptionsState();
}

async function handleClearScanCache() {
  await Promise.all([clearEmbeddingCache(), clearUrlHashLookup()]);
  await bumpCacheRevision();
  return getOptionsState();
}

async function handleValidateAndSaveSettings(
  incoming: Pick<UserSettings, 'apiKey' | 'enabled' | 'threshold'>,
) {
  const apiKey = incoming.apiKey.trim();
  if (incoming.enabled && !apiKey) {
    throw new Error('Add a Gemini API key before enabling scanning.');
  }

  if (apiKey) {
    await geminiEmbeddingClient.validateApiKey(apiKey);
  }

  await saveSettings({
    apiKey,
    enabled: incoming.enabled,
    threshold: clampThreshold(incoming.threshold),
    model: EMBEDDING_MODEL,
  });
  await bumpSettingsRevision();
  return getOptionsState();
}

async function getOptionsState(): Promise<OptionsState> {
  const [settings, runtimeState, mutedCount, cacheCount] = await Promise.all([
    getSettings(),
    getRuntimeState(),
    countMutedImages(),
    countEmbeddingCache(),
  ]);

  return {
    settings,
    runtimeState,
    mutedCount,
    cacheCount,
  };
}

async function requireActiveSettings() {
  const settings = await getSettings();
  if (!settings.enabled) {
    throw new Error('Image muting is currently disabled in extension settings.');
  }

  if (!settings.apiKey.trim()) {
    throw new Error('Add a Gemini API key in the extension settings first.');
  }

  return settings;
}

async function prepareImage(requestedUrl: string): Promise<FetchedImage> {
  const normalizedKey = normalizeMediaUrl(requestedUrl);
  if (!normalizedKey) {
    throw new Error('This image is not supported. Only tweet media images can be muted.');
  }

  const existing = inFlightImageFetches.get(normalizedKey);
  if (existing) {
    return existing;
  }

  const task = fetchPreparedImage(requestedUrl, normalizedKey).finally(() => {
    inFlightImageFetches.delete(normalizedKey);
  });
  inFlightImageFetches.set(normalizedKey, task);
  return task;
}

async function fetchPreparedImage(
  requestedUrl: string,
  normalizedUrl: string,
): Promise<FetchedImage> {
  let response = await fetch(normalizedUrl);
  if (!response.ok && requestedUrl !== normalizedUrl) {
    response = await fetch(requestedUrl);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch image bytes (${response.status}).`);
  }

  const bytes = await response.arrayBuffer();
  const mimeType = detectImageMimeType(bytes, response.headers.get('content-type'));
  if (!mimeType) {
    throw new Error('Only PNG and JPEG tweet images are supported.');
  }

  return {
    requestedUrl,
    normalizedMediaUrl: normalizeMediaUrl(response.url) ?? normalizedUrl,
    sha256: await sha256Hex(bytes),
    mimeType,
    base64Data: arrayBufferToBase64(bytes),
  };
}

function findBestMuteMatch(
  embedding: Float32Array,
  mutedImages: MutedImageRecord[],
  threshold: number,
) {
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMute: MutedImageRecord | undefined;

  for (const mutedImage of mutedImages) {
    if (mutedImage.embedding.length !== embedding.length) {
      continue;
    }

    const score = cosineSimilarity(embedding, mutedImage.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMute = mutedImage;
    }
  }

  if (!bestMute || bestScore < threshold) {
    return null;
  }

  return {
    matchedMuteId: bestMute.id,
    score: bestScore,
  };
}

function maybePushDecision(
  decisions: ScanDecision[],
  postId: string,
  match: { matchedMuteId: string; score: number } | null,
) {
  if (!match) {
    return;
  }

  decisions.push({
    postId,
    matchedMuteId: match.matchedMuteId,
    score: match.score,
    action: 'hide_post',
  });
}

function selectBestDecisions(decisions: ScanDecision[]) {
  const bestByPostId = new Map<string, ScanDecision>();

  for (const decision of decisions) {
    const existing = bestByPostId.get(decision.postId);
    if (!existing || decision.score > existing.score) {
      bestByPostId.set(decision.postId, decision);
    }
  }

  return Array.from(bestByPostId.values());
}

function dedupeCandidates(candidates: ScanCandidate[]) {
  return Array.from(
    new Map(candidates.map((candidate) => [buildCandidateKey(candidate), candidate])).values(),
  );
}

function clampThreshold(value: number) {
  if (!Number.isFinite(value)) {
    return 0.92;
  }

  return Math.min(0.99, Math.max(0.5, value));
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'The extension could not finish that action.';
}
