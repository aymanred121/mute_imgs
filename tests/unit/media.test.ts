import { describe, expect, it } from 'vitest';

import {
  arrayBufferToBase64,
  buildCandidateKey,
  detectImageMimeType,
  normalizeMediaUrl,
} from '@/lib/media';

describe('media helpers', () => {
  it('normalizes tweet media URLs to orig size', () => {
    expect(
      normalizeMediaUrl(
        'https://pbs.twimg.com/media/Abc123?format=jpg&name=small',
      ),
    ).toBe('https://pbs.twimg.com/media/Abc123?format=jpg&name=orig');
  });

  it('rejects non-media URLs', () => {
    expect(
      normalizeMediaUrl('https://pbs.twimg.com/profile_images/abc/photo.jpg'),
    ).toBeNull();
  });

  it('builds stable scan candidate keys', () => {
    expect(
      buildCandidateKey({
        postId: '1',
        pageUrl: 'https://x.com/home',
        mediaUrl: 'https://pbs.twimg.com/media/Abc123?format=jpg&name=small',
      }),
    ).toBe('1::https://pbs.twimg.com/media/Abc123?format=jpg&name=orig');
  });

  it('detects png and jpeg bytes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]).buffer;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer;
    expect(detectImageMimeType(png)).toBe('image/png');
    expect(detectImageMimeType(jpeg)).toBe('image/jpeg');
  });

  it('converts bytes to base64', () => {
    expect(arrayBufferToBase64(new Uint8Array([72, 105]).buffer)).toBe('SGk=');
  });
});
