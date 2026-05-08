# Day 4 — Memory + Learning (the closed loop starts compounding)

Retroactive log of what shipped on 2026-05-08.

## What changed

Three concurrent slices, all with iron-rule #9 (RLS-isolated, cross-tenant pooling forbidden) treated as load-bearing.

### 1. `packages/memory` — real implementation
- **Stack**: native Postgres + pgvector + HNSW (`vector_cosine_ops`) — *not* Zep+Graphiti. ADR 0012 superseded; rationale in the new note at the top of that ADR.
- `writeMemory({orgId, kind, content, sourceTraceId?, validUntil?, confidence?})` — embeds via OpenAI `text-embedding-3-small` (1536d), inserts into `agent_memories` with `::vector` cast, returns `memoryId`.
- `retrieveMemories({orgId, query, k=5, asOf=now, kinds?})` — embeds query, runs raw SQL with cosine `<=>` ordering, respects `valid_until` cutoff. Returns memories sorted by similarity descending.
- `forgetMemory({orgId, memoryId})` — soft-delete (`valid_until = now()`); preserves audit trail.
- `createFakeEmbedder()` — deterministic L2-normalised vectors for tests.

### 2. `packages/learning` — real Trigger.dev jobs
- `distillTracesIntoMemories({orgName, traces, feedback, outcomes}, deps)` — pure function, calls Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`) with a strict-output system prompt; Zod-validates the model's JSON; drops items below `confidence` floor 0.55.
- `writeMemoriesFromTracesJob` — daily 00:30 UTC; for every org with ≥1 trace yesterday, distills + `writeMemory`s.
- `measureClosedLoopJob` — daily 01:00 UTC; computes grounding_rate / feature_recall / outcome_accuracy per (org, date), upserts into new `closed_loop_metrics`. 60-day stagnation alert via structured pino warn.
- `rebuildEvalSetJob` — Sunday 02:00 UTC; 90-day operator-flagged traces → `org_eval_set` fixtures.
- `tuneThresholdsJob` — Sunday 02:30 UTC; false-positive feedback bumps `org_thresholds.threshold_value` by 10%, records `tune_method='auto_v1'`.
- `optimizePromptJob` — schemaTask stub (DSPy+GEPA deferred per ADR 0013).

### 3. `packages/agent` updates
- `createAgent({memoryProvider})` — new optional hook called at run-start with `{orgId, query, asOf}`. Returned memories are pre-seeded into the trace buffer's `memory_ids` set and rendered as a markdown bullet list into the system prompt's `{{MEMORIES}}` placeholder.
- `Citation` discriminated union now includes `MemoryCitation { kind:'memory', memory_id }`.
- Grounding validator accepts `[memory:<id>]` markers + structural `{kind:'memory'}` citations, gated on the trace buffer's `memory_ids` set.
- Embedded prompt template synced with the canonical `.md`; new section "When generating top_movers / flags / actions, factor these memories in" steers the model to cite memories rather than re-flag normal patterns as anomalies.
- `agent_traces.memory_ids text[]` column added (migration `20260508120100_agent_traces_memory_ids.sql`); persistence path writes it.

### 4. MCP tool `get_relevant_memories`
- Real implementation in `apps/mcp/src/tools/index.ts`. Org-scoped via the bearer's session var; returns `{memory_id, kind, content, valid_from, valid_until, confidence, similarity, source_trace_id}` array sorted by cosine similarity. The agent can call this mid-run when the prompt-injected memories aren't enough.

### 5. Slack feedback → memory (immediate path)
- `apps/slack/src/handlers/feedback-buttons.ts` — when `signal === 'correction' | 'negative'` AND the action body carries the original message text, also `writeMemory({kind: 'correction'|'preference', content: 'From operator on trace X: ...', sourceTraceId, confidence: 0.85})`. Operator no longer waits 24h for the daily distillation to fold their note into tomorrow's report.

### 6. New table — `closed_loop_metrics`
- Migration `20260508120000_closed_loop_metrics.sql`.
- Columns: `id`, `org_id`, `date`, `grounding_rate (5,4)`, `feature_recall (5,4)`, `outcome_accuracy (5,4)`, `traces_count`, `feedback_count`, `memories_written`, `computed_at`. UNIQUE(org_id, date). RLS via `requesting_org_id()`.
- ADR 0016 documents the three-KPI choice.

### 7. Drizzle schema mirrors
- Added `agentMemories` (with `vector(1536)` customType for pgvector), `orgEvalSet`, `orgThresholds`, `closedLoopMetrics` to `packages/database/src/schema/closed-loop.ts`.

## Tests added

- `packages/memory/tests/embeddings.test.ts` — 3 tests, fake embedder properties.
- `packages/memory/tests/memory-db.test.ts` — 4 DB-gated tests (skipIf `MEMORY_TEST_DB_URL` unset): write+retrieve, RLS isolation across two orgs, temporal validity (asOf cutoff), forgetMemory soft-delete.
- `packages/learning/tests/distill.test.ts` — 5 tests, mocked Anthropic, fence-stripping, confidence floor.
- `packages/agent/tests/agent-with-memories.test.ts` — 2 tests, mocked transport captures system prompt, asserts memory bullets land + `[memory:<id>]` citations validate.

## ADRs / runbooks

- ADR 0012 — superseded-in-day-4 note added at top.
- ADR 0016 — new, documents grounding_rate / feature_recall / outcome_accuracy decision.
- `docs/runbooks/MEMORY_OPERATIONS.md` — new (inspect, similarity-search, forget, manual seed, distill rerun).
- `docs/runbooks/CLOSED_LOOP_OPERATIONS.md` — updated; closed-loop-stagnation alert; full end-to-end flow diagram.
- `docs/runbooks/TRIGGER_DEV_DEPLOY.md` — updated cron table.

## What did *not* ship (deferred)

- **DSPy + GEPA prompt evolution** — Day 30+ per ADR 0013. `optimizePromptJob` exists as a no-op stub.
- **Cosine-similarity dedupe at writeMemory** — Day 5+. Currently each distill cycle inserts new rows; the daily Haiku is good enough at not repeating itself within a single call, but cross-day dedup is open.
- **Embedding cache** — Day 5+; throughput today doesn't justify it.
- **Per-org dashboard view of `closed_loop_metrics`** — Day 5+; ops checks via psql / runbook.
- **Slack modal for follow-up text on 💬** — current path captures `body.message.text` if present; full modal flow comes when we ship the Slack app rebrand.

## Open TODOs surfaced

- The `featuresMentioned` heuristic in `measure-closed-loop.ts` is naive (substring match against a small list of metric names). Day-5+ should make it use the day's `agent_traces.snapshot_ids` join to derive expected features per fixture — closer to operator intent.
- `agent_outcomes` is empty until we wire something to populate it. Day-5+ when delivery surfaces a "did you take this action?" prompt.
- `org_thresholds` starts empty for new orgs. Need a seed step on org create OR derive from `daily_metrics` once N days exist.

## Day-5 recommendation
Meta + Google connectors. The agent currently has revenue-side truth (Shopify + Stripe) but no ad-spend side, so ROAS, blended_mer, and CAC can't be computed. Closing that loop unlocks the real CFO-grade story, and gives the closed-loop measurement something *meaty* to track recall against.
