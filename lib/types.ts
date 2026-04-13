import {
  DEFAULT_THRESHOLD,
  EMBEDDING_MODEL,
  OUTPUT_DIMENSIONALITY,
} from '@/lib/constants';

export type SupportedMimeType = 'image/jpeg' | 'image/png';

export type UserSettings = {
  apiKey: string;
  enabled: boolean;
  threshold: number;
  model: typeof EMBEDDING_MODEL;
  outputDimensionality: typeof OUTPUT_DIMENSIONALITY;
};

export type RuntimeState = {
  lastMutedImageId: string | null;
  libraryRevision: number;
  cacheRevision: number;
  settingsRevision: number;
};

export type MutedImageRecord = {
  id: string;
  createdAt: string;
  sourcePageUrl: string;
  mediaUrl: string;
  sha256: string;
  mimeType: SupportedMimeType;
  embedding: Float32Array;
};

export type EmbeddingCacheEntry = {
  sha256: string;
  mediaUrl: string;
  mimeType: SupportedMimeType;
  embedding: Float32Array;
  lastSeenAt: string;
};

export type UrlHashLookupEntry = {
  mediaUrl: string;
  sha256: string;
  updatedAt: string;
};

export type ScanCandidate = {
  postId: string;
  pageUrl: string;
  mediaUrl: string;
};

export type ScanDecision = {
  postId: string;
  matchedMuteId: string;
  score: number;
  action: 'hide_post' | 'none';
};

export type ScanResponse = {
  decisions: ScanDecision[];
  processedKeys: string[];
  skippedReason?: 'disabled' | 'missing_api_key' | 'no_mutes';
};

export type OptionsState = {
  settings: UserSettings;
  runtimeState: RuntimeState;
  mutedCount: number;
  cacheCount: number;
};

export type RuntimeMessage =
  | { type: 'SCAN_POST_IMAGES'; candidates: ScanCandidate[] }
  | { type: 'UNDO_LAST_MUTE' }
  | { type: 'OPTIONS_GET_STATE' }
  | { type: 'OPTIONS_RESET_MUTED_LIBRARY' }
  | { type: 'OPTIONS_CLEAR_SCAN_CACHE' }
  | {
      type: 'OPTIONS_VALIDATE_AND_SAVE_SETTINGS';
      settings: Pick<UserSettings, 'apiKey' | 'enabled' | 'threshold'>;
    }
  | {
      type: 'CONTENT_SHOW_UNDO_TOAST';
      mutedImageId: string | null;
      mediaUrl?: string;
      message: string;
    };

export type FetchedImage = {
  requestedUrl: string;
  normalizedMediaUrl: string;
  sha256: string;
  mimeType: SupportedMimeType;
  base64Data: string;
};

export type PreparedCandidate = {
  candidate: ScanCandidate;
  key: string;
  image: FetchedImage;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  apiKey: '',
  enabled: true,
  threshold: DEFAULT_THRESHOLD,
  model: EMBEDDING_MODEL,
  outputDimensionality: OUTPUT_DIMENSIONALITY,
};

export const DEFAULT_RUNTIME_STATE: RuntimeState = {
  lastMutedImageId: null,
  libraryRevision: 0,
  cacheRevision: 0,
  settingsRevision: 0,
};
