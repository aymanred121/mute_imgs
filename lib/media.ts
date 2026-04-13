import { TWEET_MEDIA_PREFIX } from '@/lib/constants';
import type { ScanCandidate, SupportedMimeType } from '@/lib/types';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export function isTweetMediaUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'pbs.twimg.com' &&
      url.pathname.startsWith('/media/')
    );
  } catch {
    return false;
  }
}

export function normalizeMediaUrl(value: string): string | null {
  if (!isTweetMediaUrl(value)) {
    return null;
  }

  const url = new URL(value);
  const normalized = new URL(`${url.origin}${url.pathname}`);

  if (url.searchParams.has('format')) {
    normalized.searchParams.set('format', url.searchParams.get('format') ?? '');
    normalized.searchParams.set('name', 'orig');
    return normalized.toString();
  }

  if (url.searchParams.has('name')) {
    normalized.searchParams.set('name', 'orig');
  }

  return normalized.toString();
}

export function buildCandidateKey(candidate: ScanCandidate): string {
  return `${candidate.postId}::${normalizeMediaUrl(candidate.mediaUrl) ?? candidate.mediaUrl}`;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function detectImageMimeType(
  bytes: ArrayBuffer,
  contentTypeHeader?: string | null,
): SupportedMimeType | null {
  const header = contentTypeHeader?.toLowerCase() ?? '';
  if (header.startsWith('image/png')) {
    return 'image/png';
  }
  if (header.startsWith('image/jpeg')) {
    return 'image/jpeg';
  }

  const view = new Uint8Array(bytes);
  if (matchesSignature(view, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (matchesSignature(view, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  return null;
}

export function arrayBufferToBase64(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  const chunkSize = 0x8000;

  for (let index = 0; index < view.length; index += chunkSize) {
    binary += String.fromCharCode(...view.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function mediaUrlForMatch(value: string): string {
  return normalizeMediaUrl(value) ?? value;
}

function matchesSignature(view: Uint8Array, signature: number[]) {
  return signature.every((value, index) => view[index] === value);
}

export { TWEET_MEDIA_PREFIX };
