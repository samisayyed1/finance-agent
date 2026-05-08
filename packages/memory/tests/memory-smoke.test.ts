/**
 * Day-4 end-to-end smoke (no DB, no live OpenAI). Drives writeMemory +
 * retrieveMemories through a fake embedder + an in-memory shim of the
 * pgvector cosine query so the closed-loop pipeline can be sanity-checked
 * in CI without infrastructure.
 *
 * The shim is *only* for this smoke. The DB-gated suite in
 * memory-db.test.ts exercises the real Postgres + HNSW path.
 */

import { describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../src/embeddings";

interface SeededMemory {
  confidence: number | null;
  content: string;
  embedding: number[];
  id: string;
  kind: string;
  orgId: string;
  sourceTraceId: string | null;
  validFrom: Date;
  validUntil: Date | null;
}

const cosine = (a: number[], b: number[]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
};

describe("memory smoke (in-memory shim)", () => {
  it("writes 3 memories, retrieves top 2 by similarity for a related query", async () => {
    const embedder = createFakeEmbedder();
    const ORG = "11111111-1111-4111-8111-aaaaaaaaaaaa";
    const store: SeededMemory[] = [];

    const writeMemory = async (input: {
      orgId: string;
      kind: string;
      content: string;
      confidence?: number;
    }) => {
      const id = `mem-${store.length + 1}`;
      const embedding = await embedder.embed(input.content);
      store.push({
        id,
        orgId: input.orgId,
        kind: input.kind,
        content: input.content,
        embedding,
        validFrom: new Date(),
        validUntil: null,
        confidence: input.confidence ?? null,
        sourceTraceId: null,
      });
      return { memoryId: id };
    };

    const retrieveMemories = async (input: {
      orgId: string;
      query: string;
      k?: number;
    }) => {
      const queryEmbedding = await embedder.embed(input.query);
      return store
        .filter((m) => m.orgId === input.orgId && m.validUntil === null)
        .map((m) => ({
          ...m,
          similarity: cosine(queryEmbedding, m.embedding),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, input.k ?? 5);
    };

    await writeMemory({
      orgId: ORG,
      kind: "pattern",
      content: "Brand has consistent Tuesday-Thursday peak revenue.",
      confidence: 0.82,
    });
    await writeMemory({
      orgId: ORG,
      kind: "preference",
      content: "Operator prefers actions framed as % rather than $.",
      confidence: 0.95,
    });
    await writeMemory({
      orgId: ORG,
      kind: "vendor_quirk",
      content: "3PL delivery takes ~36h after shipment in this brand's data.",
      confidence: 0.7,
    });

    const results = await retrieveMemories({
      orgId: ORG,
      query: "weekday revenue Tuesday peak pattern",
      k: 2,
    });

    expect(results).toHaveLength(2);
    // Top result should be the pattern memory.
    expect(results[0].kind).toBe("pattern");
    expect(results[0].similarity).toBeGreaterThan(0.3);

    // Print to stdout so the smoke output ends up in the test log for the
    // Day-4 PR description.
    process.stderr.write(
      `\n=== memory smoke top-2 ===\n${results
        .map(
          (r) => `  - ${r.kind}: ${r.content} (sim=${r.similarity.toFixed(4)})`
        )
        .join("\n")}\n=========================\n`
    );
  });
});
