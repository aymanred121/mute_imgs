import { describe, expect, it } from 'vitest';

import {
  buildImageEmbeddingRequest,
  extractEmbeddingVectors,
} from '@/lib/gemini';

describe('gemini helpers', () => {
  it('builds inlineData embedding requests', () => {
    const request = buildImageEmbeddingRequest([
      {
        mimeType: 'image/png',
        base64Data: 'abc123',
      },
    ]);

    expect(request.model).toBe('gemini-embedding-2-preview');
    expect(request.config.outputDimensionality).toBe(768);
    expect(request.contents[0]?.parts[0]).toEqual({
      inlineData: {
        data: 'abc123',
        mimeType: 'image/png',
      },
    });
  });

  it('extracts and normalizes returned vectors', () => {
    const [vector] = extractEmbeddingVectors(
      {
        embeddings: [{ values: [3, 4] }],
      },
      1,
    );

    expect(vector[0]).toBeCloseTo(0.6);
    expect(vector[1]).toBeCloseTo(0.8);
  });
});
