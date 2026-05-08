/**
 * @ai-cfo/memory — temporal, per-org agent memory on native Postgres + pgvector.
 *
 * Day 4 ships this on top of the agent_memories table from the Day-0
 * migration (vector(1536) + HNSW index + RLS). No external dependency:
 * Supabase is the substrate. ADR 0012 supersedes the Zep+Graphiti choice
 * — defer to Day-8+ if temporal entity-relation reasoning across many
 * sources becomes the bottleneck.
 *
 * Iron rule echo (#9): RLS scopes every read by org_id. Cross-tenant
 * pooling is impossible: the policy `using (org_id = requesting_org_id())`
 * means a query for org A literally cannot return org B's rows even if
 * the app code forgot to filter. Tests in memory-rls.test.ts verify.
 *
 * Iron rule echo (#1): the AI never computes a number. Memory contents
 * are operator-derived natural language; no numerics are stored or
 * returned without an operator-source citation slot.
 */

import { agentMemories, database, sql } from "@ai-cfo/database";
import { z } from "zod";
import { type Embedder, openAiEmbedder } from "./embeddings";

export const MemoryKindSchema = z.enum([
  "pattern",
  "preference",
  "correction",
  "outcome",
  "vendor_quirk",
  "threshold_override",
]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export interface Memory {
  confidence: number | null;
  content: string;
  kind: MemoryKind;
  memoryId: string;
  orgId: string;
  similarity?: number;
  sourceTraceId: string | null;
  validFrom: Date;
  validUntil: Date | null;
}

const WriteMemoryInput = z.object({
  orgId: z.string().uuid(),
  kind: MemoryKindSchema,
  content: z.string().min(1).max(2000),
  sourceTraceId: z.string().min(1).optional(),
  validUntil: z.date().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type WriteMemoryInput = z.infer<typeof WriteMemoryInput>;

const RetrieveMemoriesInput = z.object({
  orgId: z.string().uuid(),
  query: z.string().min(1),
  k: z.number().int().min(1).max(50).optional(),
  asOf: z.date().optional(),
  kinds: z.array(MemoryKindSchema).optional(),
});
export type RetrieveMemoriesInput = z.infer<typeof RetrieveMemoriesInput>;

const ForgetMemoryInput = z.object({
  orgId: z.string().uuid(),
  memoryId: z.string().uuid(),
});

export interface MemoryDeps {
  embedder: Embedder;
}

const defaultDeps = (): MemoryDeps => ({ embedder: openAiEmbedder });

const toVectorLiteral = (vec: number[]): string => `[${vec.join(",")}]`;

const numericToFloat = (v: string | null): number | null =>
  v === null ? null : Number(v);

export const writeMemory = async (
  raw: WriteMemoryInput,
  deps: MemoryDeps = defaultDeps()
): Promise<{ memoryId: string }> => {
  const input = WriteMemoryInput.parse(raw);
  const embedding = await deps.embedder.embed(input.content);
  // Drizzle's customType wires toDriver but pgvector + postgres-js binary
  // protocol can be flaky for inserts; the explicit `::vector` cast via
  // `sql` is the robust path.
  const inserted = await database
    .insert(agentMemories)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      content: input.content,
      embedding:
        sql`${toVectorLiteral(embedding)}::vector` as unknown as number[],
      sourceTraceId: input.sourceTraceId ?? null,
      validUntil: input.validUntil ?? null,
      confidence:
        input.confidence === undefined ? null : input.confidence.toFixed(3),
    })
    .returning({ id: agentMemories.id });
  const id = inserted[0]?.id;
  if (!id) {
    throw new Error("writeMemory: insert returned no id");
  }
  return { memoryId: id };
};

interface RawMemoryRow extends Record<string, unknown> {
  confidence: string | null;
  content: string;
  id: string;
  kind: string;
  org_id: string;
  similarity: string | number;
  source_trace_id: string | null;
  valid_from: Date;
  valid_until: Date | null;
}

const rowToMemory = (row: RawMemoryRow): Memory => {
  const kind = MemoryKindSchema.parse(row.kind);
  return {
    memoryId: row.id,
    orgId: row.org_id,
    kind,
    content: row.content,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    sourceTraceId: row.source_trace_id,
    confidence: numericToFloat(row.confidence),
    similarity:
      typeof row.similarity === "string"
        ? Number(row.similarity)
        : row.similarity,
  };
};

export const retrieveMemories = async (
  raw: RetrieveMemoriesInput,
  deps: MemoryDeps = defaultDeps()
): Promise<Memory[]> => {
  const input = RetrieveMemoriesInput.parse(raw);
  const k = input.k ?? 5;
  const asOf = input.asOf ?? new Date();
  const queryEmbedding = await deps.embedder.embed(input.query);
  const queryLit = toVectorLiteral(queryEmbedding);

  // Raw SQL is required for pgvector cosine-distance ordering — Drizzle's
  // query builder doesn't speak the `<=>` operator. Every user value
  // is bound via `sql` placeholders so this stays safe.
  const kindFilter =
    input.kinds && input.kinds.length > 0
      ? sql`and kind = any(${input.kinds})`
      : sql``;

  const result = await database.execute<RawMemoryRow>(sql`
    select id, org_id, kind, content, valid_from, valid_until,
           source_trace_id, confidence,
           1 - (embedding <=> ${queryLit}::vector) as similarity
    from public.agent_memories
    where org_id = ${input.orgId}
      and (valid_until is null or valid_until > ${asOf})
      ${kindFilter}
    order by embedding <=> ${queryLit}::vector
    limit ${k}
  `);

  return (result as unknown as RawMemoryRow[]).map(rowToMemory);
};

export const forgetMemory = async (
  raw: z.infer<typeof ForgetMemoryInput>
): Promise<void> => {
  const input = ForgetMemoryInput.parse(raw);
  await database
    .update(agentMemories)
    .set({ validUntil: new Date() })
    .where(
      sql`${agentMemories.id} = ${input.memoryId} and ${agentMemories.orgId} = ${input.orgId}`
    );
};

export {
  createFakeEmbedder,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  type Embedder,
  openAiEmbedder,
} from "./embeddings";
