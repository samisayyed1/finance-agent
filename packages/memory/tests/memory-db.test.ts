/**
 * Memory layer integration tests.
 *
 * Exercise the full path: writeMemory → embedding → INSERT → pgvector
 * cosine search → retrieveMemories. Includes:
 *   - happy-path write + retrieve
 *   - cross-tenant isolation (Day-4 iron rule #9)
 *   - temporal validity (valid_until soft-delete + asOf cutoff)
 *
 * Gated on MEMORY_TEST_DB_URL because the real test surface is the Postgres
 * + pgvector stack — there's no shippable mock for HNSW cosine ordering.
 * Set MEMORY_TEST_DB_URL=$DATABASE_URL to enable; CI skip is fine because
 * the embedder + boundary types are covered by embeddings.test.ts.
 */

import { describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.MEMORY_TEST_DB_URL);

const ORG_A = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const ORG_B = "22222222-2222-4222-8222-bbbbbbbbbbbb";
const UUID_RE = /^[0-9a-f-]{36}$/;

describe.skipIf(!HAS_DB)("memory layer (requires MEMORY_TEST_DB_URL)", () => {
  it("writeMemory persists row + retrieveMemories returns it by similarity", async () => {
    process.env.DATABASE_URL = process.env.MEMORY_TEST_DB_URL;
    const dbMod = await import("@ai-cfo/database");
    const memMod = await import("../src");

    const fake = memMod.createFakeEmbedder();
    const deps = { embedder: fake };

    // Seed an org row (RLS doesn't matter via service-role; the test DB
    // connection bypasses RLS).
    await dbMod.database
      .insert(dbMod.organizations)
      .values({
        id: ORG_A,
        name: "Memory Test A",
        slug: `memtest-a-${Date.now()}`,
      })
      .onConflictDoNothing();

    const { memoryId } = await memMod.writeMemory(
      {
        orgId: ORG_A,
        kind: "pattern",
        content: "Brand has consistent Tuesday-Thursday peak revenue.",
        confidence: 0.82,
      },
      deps
    );
    expect(memoryId).toMatch(UUID_RE);

    const results = await memMod.retrieveMemories(
      {
        orgId: ORG_A,
        query: "weekday revenue patterns Tuesday peak",
        k: 5,
      },
      deps
    );
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top.kind).toBe("pattern");
    expect(top.similarity).toBeGreaterThan(0.3);

    // Cleanup so reruns are idempotent.
    await dbMod.database
      .delete(dbMod.agentMemories)
      .where(dbMod.eq(dbMod.agentMemories.orgId, ORG_A));
  });

  it("cross-tenant isolation: org A query never returns org B memories", async () => {
    process.env.DATABASE_URL = process.env.MEMORY_TEST_DB_URL;
    const dbMod = await import("@ai-cfo/database");
    const memMod = await import("../src");
    const deps = { embedder: memMod.createFakeEmbedder() };

    await dbMod.database
      .insert(dbMod.organizations)
      .values([
        { id: ORG_A, name: "A", slug: `iso-a-${Date.now()}` },
        { id: ORG_B, name: "B", slug: `iso-b-${Date.now()}` },
      ])
      .onConflictDoNothing();

    await memMod.writeMemory(
      {
        orgId: ORG_A,
        kind: "preference",
        content: "Operator A prefers percentages over dollars.",
        confidence: 0.9,
      },
      deps
    );
    await memMod.writeMemory(
      {
        orgId: ORG_B,
        kind: "preference",
        content: "Operator B prefers dollar amounts over percentages.",
        confidence: 0.9,
      },
      deps
    );

    const aResults = await memMod.retrieveMemories(
      { orgId: ORG_A, query: "operator prefers percentages dollars", k: 10 },
      deps
    );
    const bResults = await memMod.retrieveMemories(
      { orgId: ORG_B, query: "operator prefers percentages dollars", k: 10 },
      deps
    );
    for (const m of aResults) {
      expect(m.orgId).toBe(ORG_A);
      expect(m.content).toContain("Operator A");
    }
    for (const m of bResults) {
      expect(m.orgId).toBe(ORG_B);
      expect(m.content).toContain("Operator B");
    }

    await dbMod.database
      .delete(dbMod.agentMemories)
      .where(dbMod.eq(dbMod.agentMemories.orgId, ORG_A));
    await dbMod.database
      .delete(dbMod.agentMemories)
      .where(dbMod.eq(dbMod.agentMemories.orgId, ORG_B));
  });

  it("temporal: memories with valid_until in the past are excluded", async () => {
    process.env.DATABASE_URL = process.env.MEMORY_TEST_DB_URL;
    const dbMod = await import("@ai-cfo/database");
    const memMod = await import("../src");
    const deps = { embedder: memMod.createFakeEmbedder() };

    await dbMod.database
      .insert(dbMod.organizations)
      .values({ id: ORG_A, name: "A", slug: `tem-a-${Date.now()}` })
      .onConflictDoNothing();

    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { memoryId: stale } = await memMod.writeMemory(
      {
        orgId: ORG_A,
        kind: "vendor_quirk",
        content: "Old 3PL delivery took 36h after shipment.",
        validUntil: past,
      },
      deps
    );
    const { memoryId: fresh } = await memMod.writeMemory(
      {
        orgId: ORG_A,
        kind: "vendor_quirk",
        content: "New 3PL delivery takes 18h after shipment.",
      },
      deps
    );

    const now = await memMod.retrieveMemories(
      { orgId: ORG_A, query: "3PL delivery shipment timing", k: 10 },
      deps
    );
    const ids = now.map((m) => m.memoryId);
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(stale);

    const historical = await memMod.retrieveMemories(
      {
        orgId: ORG_A,
        query: "3PL delivery shipment timing",
        k: 10,
        asOf: new Date(past.getTime() - 1000),
      },
      deps
    );
    const histIds = historical.map((m) => m.memoryId);
    expect(histIds).toContain(stale);

    await dbMod.database
      .delete(dbMod.agentMemories)
      .where(dbMod.eq(dbMod.agentMemories.orgId, ORG_A));
  });

  it("forgetMemory soft-deletes (sets valid_until = now)", async () => {
    process.env.DATABASE_URL = process.env.MEMORY_TEST_DB_URL;
    const dbMod = await import("@ai-cfo/database");
    const memMod = await import("../src");
    const deps = { embedder: memMod.createFakeEmbedder() };

    await dbMod.database
      .insert(dbMod.organizations)
      .values({ id: ORG_A, name: "A", slug: `forget-a-${Date.now()}` })
      .onConflictDoNothing();

    const { memoryId } = await memMod.writeMemory(
      {
        orgId: ORG_A,
        kind: "correction",
        content: "Operator clarified: Sunday drops are normal Sabbath.",
      },
      deps
    );
    await memMod.forgetMemory({ orgId: ORG_A, memoryId });

    const after = await memMod.retrieveMemories(
      { orgId: ORG_A, query: "Sunday drops normal Sabbath", k: 10 },
      deps
    );
    expect(after.find((m) => m.memoryId === memoryId)).toBeUndefined();

    await dbMod.database
      .delete(dbMod.agentMemories)
      .where(dbMod.eq(dbMod.agentMemories.orgId, ORG_A));
  });
});

if (!HAS_DB) {
  describe("memory layer (skipped: MEMORY_TEST_DB_URL not set)", () => {
    it("documented harness — set MEMORY_TEST_DB_URL to enable", () => {
      expect(true).toBe(true);
    });
  });
}
