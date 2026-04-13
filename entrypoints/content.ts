import { DEFAULT_TOAST_MS, X_HOST_MATCHES } from '@/lib/constants';
import { buildCandidateKey } from '@/lib/media';
import { findArticlesByMediaUrl, findArticlesByPostId, getTweetArticles, collectScanCandidates } from '@/lib/x-dom';
import type {
  RuntimeMessage,
  RuntimeState,
  ScanDecision,
  ScanResponse,
} from '@/lib/types';

const HIDDEN_ATTRIBUTE = 'data-muted-by-ext';
const MUTE_ID_ATTRIBUTE = 'data-muted-match-id';
const SCORE_ATTRIBUTE = 'data-muted-score';

export default defineContentScript({
  matches: X_HOST_MATCHES,
  runAt: 'document_end',
  main() {
    injectStyles();
    startScanner();
  },
});

function startScanner() {
  const observedArticles = new Set<HTMLElement>();
  const visibleArticles = new Set<HTMLElement>();
  const processedKeys = new Set<string>();
  const pendingKeys = new Set<string>();

  let scanTimer: number | undefined;
  let scanInFlight = false;
  let rescanQueued = false;

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const article = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          visibleArticles.add(article);
        } else {
          visibleArticles.delete(article);
        }
      }

      scheduleScan(120);
    },
    { threshold: 0.05 },
  );

  const mutationObserver = new MutationObserver(() => {
    refreshObservedArticles();
    scheduleScan(180);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  refreshObservedArticles();
  scheduleScan(300);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      scheduleScan(120);
    }
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes.userSettings || runtimeStateChanged(changes.runtimeState)) {
      resetLocalState();
      scheduleScan(0);
    }
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type !== 'CONTENT_SHOW_UNDO_TOAST') {
      return;
    }

    if (message.mediaUrl && message.mutedImageId) {
      hideArticlesByMediaUrl(message.mediaUrl, message.mutedImageId, 1);
    }
    showUndoToast(message.message, message.mutedImageId);
  });

  function refreshObservedArticles() {
    for (const article of getTweetArticles()) {
      if (!observedArticles.has(article)) {
        observedArticles.add(article);
        intersectionObserver.observe(article);
      }
    }

    pruneDetachedArticles(observedArticles, visibleArticles);
  }

  function scheduleScan(delayMs: number) {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      void runScan();
    }, delayMs);
  }

  async function runScan() {
    if (document.hidden) {
      return;
    }

    if (scanInFlight) {
      rescanQueued = true;
      return;
    }

    scanInFlight = true;

    try {
      const candidates = collectScanCandidates(getCandidateArticles()).filter((candidate) => {
        const key = buildCandidateKey(candidate);
        return !processedKeys.has(key) && !pendingKeys.has(key);
      });

      if (!candidates.length) {
        return;
      }

      for (const candidate of candidates) {
        pendingKeys.add(buildCandidateKey(candidate));
      }

      const response = await sendBackgroundMessage<ScanResponse>({
        type: 'SCAN_POST_IMAGES',
        candidates,
      });

      const processedThisRound = new Set(response.processedKeys);
      for (const candidate of candidates) {
        const key = buildCandidateKey(candidate);
        pendingKeys.delete(key);
        if (processedThisRound.has(key)) {
          processedKeys.add(key);
        }
      }

      applyDecisions(response.decisions);
    } catch (error) {
      console.warn('Mute Similar X Images scan failed.', error);
      pendingKeys.clear();
    } finally {
      scanInFlight = false;
      if (rescanQueued) {
        rescanQueued = false;
        scheduleScan(200);
      }
    }
  }

  function getCandidateArticles() {
    const liveVisibleArticles = Array.from(visibleArticles).filter((article) => article.isConnected);
    return liveVisibleArticles.length ? liveVisibleArticles : getTweetArticles();
  }

  function applyDecisions(decisions: ScanDecision[]) {
    for (const decision of decisions) {
      if (decision.action === 'hide_post') {
        hideArticlesByPostId(decision.postId, decision.matchedMuteId, decision.score);
      }
    }
  }

  function resetLocalState() {
    processedKeys.clear();
    pendingKeys.clear();
    unhideAllArticles();
  }
}

function hideArticlesByPostId(postId: string, muteId: string, score: number) {
  for (const article of findArticlesByPostId(postId)) {
    hideArticle(article, muteId, score);
  }
}

function hideArticlesByMediaUrl(mediaUrl: string, muteId: string, score: number) {
  for (const article of findArticlesByMediaUrl(mediaUrl)) {
    hideArticle(article, muteId, score);
  }
}

function hideArticle(article: HTMLElement, muteId: string, score: number) {
  article.setAttribute(HIDDEN_ATTRIBUTE, 'true');
  article.setAttribute(MUTE_ID_ATTRIBUTE, muteId);
  article.setAttribute(SCORE_ATTRIBUTE, score.toFixed(3));
}

function unhideAllArticles() {
  for (const article of document.querySelectorAll<HTMLElement>(`article[${HIDDEN_ATTRIBUTE}]`)) {
    article.removeAttribute(HIDDEN_ATTRIBUTE);
    article.removeAttribute(MUTE_ID_ATTRIBUTE);
    article.removeAttribute(SCORE_ATTRIBUTE);
  }
}

function injectStyles() {
  if (document.getElementById('mute-similar-x-images-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mute-similar-x-images-style';
  style.textContent = `
    article[${HIDDEN_ATTRIBUTE}="true"] {
      display: none !important;
    }

    .mute-similar-x-toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 360px;
      padding: 14px 16px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.94);
      color: #f9fafb;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45);
      font: 500 14px/1.4 "IBM Plex Sans", "Segoe UI", sans-serif;
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: opacity 160ms ease, transform 160ms ease;
    }

    .mute-similar-x-toast[data-visible="true"] {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .mute-similar-x-toast__message {
      flex: 1;
    }

    .mute-similar-x-toast__button {
      border: none;
      border-radius: 999px;
      padding: 8px 12px;
      background: #f59e0b;
      color: #111827;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }
  `;

  document.documentElement.append(style);
}

let toastTimer: number | undefined;

function showUndoToast(message: string, mutedImageId: string | null) {
  const toast = ensureToast();
  const messageElement = toast.querySelector<HTMLElement>('.mute-similar-x-toast__message');
  const button = toast.querySelector<HTMLButtonElement>('.mute-similar-x-toast__button');
  if (!messageElement || !button) {
    return;
  }

  messageElement.textContent = message;
  button.hidden = !mutedImageId;
  button.onclick = async () => {
    button.disabled = true;
    try {
      const response = await sendBackgroundMessage<{ ok: boolean; message: string }>({
        type: 'UNDO_LAST_MUTE',
      });
      showUndoToast(response.message, null);
    } catch (error) {
      showUndoToast(
        error instanceof Error ? error.message : 'Could not undo the last mute.',
        null,
      );
    } finally {
      button.disabled = false;
    }
  };

  toast.dataset.visible = 'true';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.dataset.visible = 'false';
  }, DEFAULT_TOAST_MS);
}

function ensureToast() {
  let toast = document.querySelector<HTMLDivElement>('.mute-similar-x-toast');
  if (toast) {
    return toast;
  }

  toast = document.createElement('div');
  toast.className = 'mute-similar-x-toast';
  toast.innerHTML = `
    <div class="mute-similar-x-toast__message"></div>
    <button class="mute-similar-x-toast__button" type="button">Undo</button>
  `;
  document.documentElement.append(toast);
  return toast;
}

function pruneDetachedArticles(
  observedArticles: Set<HTMLElement>,
  visibleArticles: Set<HTMLElement>,
) {
  for (const article of observedArticles) {
    if (!article.isConnected) {
      observedArticles.delete(article);
      visibleArticles.delete(article);
    }
  }
}

function runtimeStateChanged(
  change:
    | {
        oldValue?: unknown;
        newValue?: unknown;
      }
    | undefined,
) {
  if (!change) {
    return false;
  }

  const previous = change.oldValue as RuntimeState | undefined;
  const next = change.newValue as RuntimeState | undefined;
  if (!previous || !next) {
    return true;
  }

  return (
    previous.libraryRevision !== next.libraryRevision ||
    previous.cacheRevision !== next.cacheRevision ||
    previous.settingsRevision !== next.settingsRevision
  );
}

async function sendBackgroundMessage<T>(message: RuntimeMessage): Promise<T> {
  const response = await browser.runtime.sendMessage(message) as
    | { ok: true; data: T }
    | { ok: false; error: string }
    | undefined;

  if (!response) {
    throw new Error('The extension background worker did not return a response.');
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}
