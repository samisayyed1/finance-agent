import { describe, expect, it } from "vitest";
import { createFakeEmbedder, EMBEDDING_DIMS } from "../src/embeddings";

const cosine = (a: number[], b: number[]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

describe("fake embedder (test fixture)", () => {
  const embedder = createFakeEmbedder();

  it("produces 1536-dim L2-normalized vectors", async () => {
    const v = await embedder.embed("revenue spike on Tuesday");
    expect(v).toHaveLength(EMBEDDING_DIMS);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("similar text → higher cosine similarity than random", async () => {
    const a = await embedder.embed("Tuesday revenue spike pattern");
    const b = await embedder.embed("Pattern: revenue spike on Tuesday");
    const sim = cosine(a, b);
    expect(sim).toBeGreaterThan(0.4);
  });

  it("dissimilar text → low cosine similarity", async () => {
    const a = await embedder.embed("operator prefers percentages over dollars");
    const b = await embedder.embed(
      "3PL ships on Friday after Wednesday orders"
    );
    const sim = cosine(a, b);
    expect(sim).toBeLessThan(0.2);
  });
});
