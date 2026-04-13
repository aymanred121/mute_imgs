import { mediaUrlForMatch } from '@/lib/media';
import type { ScanCandidate } from '@/lib/types';

export function getTweetArticles(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('article'));
}

export function extractPostId(article: ParentNode): string | null {
  const anchors = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]');

  for (const anchor of anchors) {
    const match = anchor.href.match(/\/status\/(\d+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function collectTweetMediaUrls(article: ParentNode): string[] {
  const mediaUrls = new Set<string>();

  for (const image of article.querySelectorAll<HTMLImageElement>('img')) {
    const source = image.currentSrc || image.src || image.getAttribute('src') || '';
    const normalized = normalizeImageSource(source);
    if (normalized) {
      mediaUrls.add(normalized);
    }
  }

  return Array.from(mediaUrls);
}

export function collectScanCandidates(
  articles: Iterable<HTMLElement>,
  pageUrl = window.location.href,
): ScanCandidate[] {
  const candidates: ScanCandidate[] = [];

  for (const article of articles) {
    if (!article.isConnected) {
      continue;
    }

    const postId = extractPostId(article);
    if (!postId) {
      continue;
    }

    for (const mediaUrl of collectTweetMediaUrls(article)) {
      candidates.push({
        postId,
        pageUrl,
        mediaUrl,
      });
    }
  }

  return candidates;
}

export function findArticlesByPostId(
  postId: string,
  root: ParentNode = document,
): HTMLElement[] {
  return getTweetArticles(root).filter((article) => extractPostId(article) === postId);
}

export function findArticlesByMediaUrl(
  mediaUrl: string,
  root: ParentNode = document,
): HTMLElement[] {
  const target = mediaUrlForMatch(mediaUrl);
  return getTweetArticles(root).filter((article) =>
    collectTweetMediaUrls(article).some(
      (candidate) => mediaUrlForMatch(candidate) === target,
    ),
  );
}

function normalizeImageSource(source: string): string | null {
  if (!source.startsWith('http')) {
    return null;
  }

  return source.includes('pbs.twimg.com/media/') ? source : null;
}
