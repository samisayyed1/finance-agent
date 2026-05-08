# Memory Operations

Day-4 wired `agent_memories` (native Postgres + pgvector + HNSW + RLS). This
runbook is the day-to-day for inspecting, correcting, and seeding memory
content for a specific org.

## Layout

- Table: `public.agent_memories`
- Columns: `id`, `org_id`, `kind`, `content`, `embedding (vector(1536))`,
  `valid_from`, `valid_until`, `source_trace_id`, `confidence`, `created_at`.
- Index: HNSW on `embedding` with `vector_cosine_ops` + B-tree on
  `(org_id, valid_from desc, valid_until)`.
- RLS: `using (org_id = requesting_org_id())` — service-role bypasses RLS,
  app code does not.

## Inspect memories for an org

```sql
-- Replace the UUID below.
select id, kind, left(content, 80) as content,
       confidence, valid_from, valid_until, source_trace_id
from public.agent_memories
where org_id = 'd4e48133-369e-4cee-abb6-c517da3ef173'
  and valid_until is null
order by created_at desc
limit 50;
```

## Find similar memories to a phrase

The agent runs this every report. Reproduce it locally with a query embedding:

```sql
-- Embed the phrase via OpenAI text-embedding-3-small client-side; paste the
-- 1536-dim array literal in. The query plan should show HNSW use.
select id, kind, left(content, 100) as content,
       1 - (embedding <=> '[0.012, -0.043, ...]'::vector) as similarity
from public.agent_memories
where org_id = $1
  and (valid_until is null or valid_until > now())
order by embedding <=> '[0.012, -0.043, ...]'::vector
limit 10;
```

## Forget a memory (soft delete)

The product calls `forgetMemory({orgId, memoryId})` from `@ai-cfo/memory`,
which sets `valid_until = now()`. Operationally:

```sql
update public.agent_memories
set valid_until = now()
where id = '<memory_uuid>'
  and org_id = '<org_uuid>';
```

Audit trail is preserved — queries with `asOf` in the past still see the
memory. Hard deletion is not part of the runtime API; only run `DELETE`
manually for GDPR/PII removal, and annotate the change in
`docs/runbooks/INCIDENT_PLAYBOOKS.md`.

## Seed a memory manually

Operator preferences sometimes need to land before the daily distillation
cron has any data to chew on. Use the `writeMemory` API rather than raw SQL
so the embedding is generated correctly:

```ts
import { writeMemory } from "@ai-cfo/memory";

await writeMemory({
  orgId: "d4e48133-369e-4cee-abb6-c517da3ef173",
  kind: "preference",
  content: "Operator prefers actions framed as % rather than $.",
  confidence: 0.95,
});
```

If you must use SQL, generate the embedding in a one-off script (any
OpenAI SDK call to `text-embedding-3-small`) and INSERT the row with the
vector literal.

## Distillation

The daily `write-memories-from-traces` Trigger.dev job (00:30 UTC) reads
yesterday's traces + feedback + outcomes per org, calls Claude Haiku 4.5
to distill, and writes surviving memories (confidence ≥ 0.55) via
`writeMemory`. To re-run for a specific window:

```ts
import { writeMemoriesFromTracesForOrg, createAnthropicDistiller }
  from "@ai-cfo/learning";

await writeMemoriesFromTracesForOrg(
  orgId,
  orgName,
  new Date(Date.now() - 24 * 60 * 60 * 1000),
  { callModel: createAnthropicDistiller() }
);
```

## Cross-tenant safety

RLS is the load-bearing guarantee. A cross-org leak via the app surface
should be impossible. If you see one, that's a SEV-2 — open an incident
under `INCIDENT_PLAYBOOKS.md` and pause the affected workflows.
