/**
 * @ai-cfo/memory — temporal, per-org agent memory.
 *
 * Backed by Zep + Graphiti (Apache 2.0). Every read and write is namespaced
 * by org_id; the underlying knowledge graph and validity windows track
 * "what was true when" so we can answer questions about both current and
 * historical state.
 *
 * Iron rule echo: cross-tenant pooling is FORBIDDEN. Every public function in
 * this module enforces an org_id parameter.
 */

export type MemoryKind =
  | "pattern"
  | "preference"
  | "correction"
  | "outcome"
  | "vendor_quirk"
  | "threshold_override";

export interface Memory {
  confidence?: number;
  content: string;
  id: string;
  kind: MemoryKind;
  org_id: string;
  source_trace_id?: string;
  valid_from: Date;
  valid_until?: Date;
}

const notImplemented = <T>(method: string): Promise<T> =>
  Promise.reject(
    new Error(`@ai-cfo/memory: ${method} not implemented (Day-0)`)
  );

export const writeMemory = (_args: {
  orgId: string;
  kind: MemoryKind;
  content: string;
  sourceTraceId?: string;
  validUntil?: Date;
}): Promise<Memory> => notImplemented<Memory>("writeMemory");

export const retrieveMemories = (_args: {
  orgId: string;
  query: string;
  k?: number;
  asOf?: Date;
}): Promise<Memory[]> => notImplemented<Memory[]>("retrieveMemories");

export const buildKnowledgeGraph = (_args: {
  orgId: string;
  traceId: string;
}): Promise<void> => notImplemented<void>("buildKnowledgeGraph");

export const forgetMemory = (_args: {
  orgId: string;
  memoryId: string;
}): Promise<void> => notImplemented<void>("forgetMemory");
