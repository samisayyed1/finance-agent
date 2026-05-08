/**
 * OpenAI text-embedding-3-small wrapper. 1536-dim vectors.
 *
 * Day-4: every writeMemory + every retrieveMemories call goes through here.
 * No caching yet (Day-5+ when we have throughput numbers worth a cache).
 *
 * The embedder is a typed boundary so tests can inject a deterministic
 * fake (`createFakeEmbedder`) and the real implementation can be
 * swapped in production without touching call-sites.
 */

import OpenAI from "openai";

export const EMBEDDING_DIMS = 1536;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

let cachedClient: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (cachedClient) {
    return cachedClient;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not set — memory layer requires OpenAI embeddings"
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
};

export const openAiEmbedder: Embedder = {
  async embed(text: string): Promise<number[]> {
    const client = getClient();
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed.length === 0) {
      throw new Error("embed: empty text");
    }
    const result = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    });
    const vec = result.data[0]?.embedding;
    if (!vec || vec.length !== EMBEDDING_DIMS) {
      throw new Error(
        `embed: expected ${EMBEDDING_DIMS}-dim vector, got ${vec?.length ?? 0}`
      );
    }
    return vec;
  },
};

/**
 * Test helper: deterministic 1536-dim vector seeded from a hashed token
 * bag of the input string. Cosine similarity between seeded vectors
 * tracks token overlap, which is what the retrieve tests need.
 */
export const createFakeEmbedder = (): Embedder => ({
  embed(text: string): Promise<number[]> {
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const vec = new Array<number>(EMBEDDING_DIMS).fill(0);
    const MAX_INT = 2 ** 32;
    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash * 31 + token.charCodeAt(i)) % MAX_INT;
      }
      const idx = hash % EMBEDDING_DIMS;
      vec[idx] += 1;
    }
    // L2-normalize so cosine and dot-product agree.
    let norm = 0;
    for (const v of vec) {
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) {
      vec[0] = 1;
      return Promise.resolve(vec);
    }
    return Promise.resolve(vec.map((v) => v / norm));
  },
});
