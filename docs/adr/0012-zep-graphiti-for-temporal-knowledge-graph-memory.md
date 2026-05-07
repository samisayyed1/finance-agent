# ADR 0012 — Zep + Graphiti for temporal knowledge-graph memory

## Status
Accepted — 2026-05-07

## Context
The agent's memory is not "what was said in the last conversation" — it is "what is true about this brand right now, what was true last quarter, and how does the answer to that question change tomorrow when a new fact lands." We need temporal validity (a fact like "they fulfil from a 3PL in Texas" is true from a date, until a date), entity-and-relation extraction, and per-org isolation.

## Decision
Adopt **Zep + Graphiti** (Apache 2.0). Use `@getzep/zep-cloud` for the managed offering or self-host Zep CE via Docker. Wrap with `@ai-cfo/memory` so every read and write is namespaced by `org_id`. Zep stores the temporal graph; Graphiti is the entity/relation extraction layer. Mem0 was considered and rejected: weaker on temporal accuracy at the LongMemEval benchmark (Zep: 63.8%).

## Consequences
- Memories include validity windows (`valid_from`, `valid_until`) — the agent can answer "what was their refund rate before the policy change?" correctly.
- Org isolation is enforced both in our wrapper (namespace prefix) and at the Postgres `agent_memories` table (RLS). Belt and suspenders.
- Zep is a runtime dependency we operate; if self-hosted, runbook in `docs/runbooks/ZEP_DEPLOYMENT.md`.
- The HNSW index on `agent_memories.embedding` lets us do fast approximate nearest-neighbour queries inside Postgres for the `get_relevant_memories` MCP tool.
- We chose Apache-2.0 over a SaaS-only product so we can self-host if cost or data-residency demands it.
