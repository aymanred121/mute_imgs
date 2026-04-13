import { describe, expect, it } from 'vitest';

import { cosineSimilarity, normalizeVector } from '@/lib/vector';

describe('vector helpers', () => {
  it('normalizes vectors to unit length', () => {
    const vector = normalizeVector([3, 4]);
    expect(vector[0]).toBeCloseTo(0.6);
    expect(vector[1]).toBeCloseTo(0.8);
  });

  it('returns cosine similarity for normalized vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('throws on shape mismatch', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
});
