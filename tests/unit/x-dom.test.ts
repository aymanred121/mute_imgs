import { describe, expect, it } from 'vitest';

import {
  collectScanCandidates,
  collectTweetMediaUrls,
  extractPostId,
  findArticlesByMediaUrl,
  findArticlesByPostId,
} from '@/lib/x-dom';

describe('x dom helpers', () => {
  it('extracts post ids and media urls from articles', () => {
    document.body.innerHTML = `
      <article id="first">
        <a href="https://x.com/test/status/12345">tweet</a>
        <img src="https://pbs.twimg.com/media/Abc123?format=jpg&name=small" />
        <img src="https://pbs.twimg.com/profile_images/avatar.jpg" />
      </article>
    `;

    const article = document.querySelector('article') as HTMLElement;
    expect(extractPostId(article)).toBe('12345');
    expect(collectTweetMediaUrls(article)).toEqual([
      'https://pbs.twimg.com/media/Abc123?format=jpg&name=small',
    ]);
  });

  it('collects candidates and finds matching articles', () => {
    document.body.innerHTML = `
      <article id="first">
        <a href="https://x.com/test/status/12345">tweet</a>
        <img src="https://pbs.twimg.com/media/Abc123?format=jpg&name=small" />
      </article>
      <article id="second">
        <a href="https://x.com/test/status/54321">tweet</a>
        <img src="https://pbs.twimg.com/media/Xyz999?format=png&name=small" />
      </article>
    `;

    const articles = Array.from(document.querySelectorAll<HTMLElement>('article'));
    expect(collectScanCandidates(articles, 'https://x.com/home')).toEqual([
      {
        postId: '12345',
        pageUrl: 'https://x.com/home',
        mediaUrl: 'https://pbs.twimg.com/media/Abc123?format=jpg&name=small',
      },
      {
        postId: '54321',
        pageUrl: 'https://x.com/home',
        mediaUrl: 'https://pbs.twimg.com/media/Xyz999?format=png&name=small',
      },
    ]);
    expect(findArticlesByPostId('12345')).toHaveLength(1);
    expect(
      findArticlesByMediaUrl(
        'https://pbs.twimg.com/media/Abc123?format=jpg&name=orig',
      ),
    ).toHaveLength(1);
  });
});
