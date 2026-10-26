import { Injectable } from '@nestjs/common';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536; // must match numDimensions in the Atlas vector index

const ENDPOINT = 'https://api.openai.com/v1/embeddings';
const BATCH_SIZE = 100;
const TIMEOUT_MS = 10_000;

@Injectable()
export class EmbeddingService {
  async embedQuery(text: string): Promise<number[]> {
    return (await this.request([text]))[0];
  }

  // Used by the indexer. Each product text is embedded once and stored on its search document.
  async embedMany(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await this.request(texts.slice(start, start + BATCH_SIZE))));
    }
    return vectors;
  }

  private async request(input: string[]): Promise<number[][]> {
    const apiKey = process.env.TEXT_EMBED_API_KEY;
    if (!apiKey) throw new Error('TEXT_EMBED_API_KEY is not set');

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
    }

    const body: { data: { index: number; embedding: number[] }[] } = await response.json();
    return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
