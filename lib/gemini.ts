import { GoogleGenAI } from '@google/genai';

import {
  EMBEDDING_MODEL,
  OUTPUT_DIMENSIONALITY,
} from '@/lib/constants';
import { normalizeVector } from '@/lib/vector';
import type { SupportedMimeType } from '@/lib/types';

export type ImageEmbeddingInput = {
  mimeType: SupportedMimeType;
  base64Data: string;
};

export function buildImageEmbeddingRequest(inputs: ImageEmbeddingInput[]) {
  return {
    model: EMBEDDING_MODEL,
    contents: inputs.map((input) => ({
      parts: [
        {
          inlineData: {
            data: input.base64Data,
            mimeType: input.mimeType,
          },
        },
      ],
    })),
    config: {
      outputDimensionality: OUTPUT_DIMENSIONALITY,
    },
  };
}

export function extractEmbeddingVectors(
  response: { embeddings?: Array<{ values?: number[] }> },
  expectedCount: number,
): Float32Array[] {
  if (!response.embeddings || response.embeddings.length !== expectedCount) {
    throw new Error('Gemini did not return the expected number of embeddings.');
  }

  return response.embeddings.map((embedding) => {
    if (!embedding.values?.length) {
      throw new Error('Gemini returned an empty embedding.');
    }

    return normalizeVector(embedding.values);
  });
}

class GeminiEmbeddingClient {
  private client: GoogleGenAI | null = null;
  private apiKey = '';

  private getClient(apiKey: string) {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      throw new Error('Missing Gemini API key.');
    }

    if (!this.client || this.apiKey !== trimmedKey) {
      this.client = new GoogleGenAI({
        apiKey: trimmedKey,
        apiVersion: 'v1beta',
      });
      this.apiKey = trimmedKey;
    }

    return this.client;
  }

  async validateApiKey(apiKey: string) {
    const response = await this.getClient(apiKey).models.embedContent({
      model: EMBEDDING_MODEL,
      contents: ['validate api key'],
      config: {
        outputDimensionality: 8,
      },
    });

    extractEmbeddingVectors(response, 1);
  }

  async embedImages(apiKey: string, inputs: ImageEmbeddingInput[]) {
    if (!inputs.length) {
      return [];
    }

    const response = await this.getClient(apiKey).models.embedContent(
      buildImageEmbeddingRequest(inputs),
    );

    return extractEmbeddingVectors(response, inputs.length);
  }
}

export const geminiEmbeddingClient = new GeminiEmbeddingClient();
