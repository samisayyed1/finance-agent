# Zep + Graphiti — deployment

Two paths. Pick one per env.

## Path A — Zep Cloud (recommended for Day-0)
- Sign up at https://www.getzep.com.
- Create a project per env.
- Issue an API key.
- Set `ZEP_API_KEY` in `.env`. Leave `ZEP_API_URL` unset (cloud client handles it).
- We use `@getzep/zep-cloud` directly from `@ai-cfo/memory`.

## Path B — Zep Community Edition (self-host)
- Run via Docker Compose: see https://github.com/getzep/zep for the canonical compose file.
- Postgres dependency for Zep CE — keep it on its own DB instance, not our Supabase project (different lifecycle, different size).
- Set `ZEP_API_KEY` and `ZEP_API_URL` (e.g. `http://zep:8000`).
- Switch the import in `@ai-cfo/memory` to `@getzep/zep-js` (CE client).

## Org isolation

Iron Rule #9 demands per-org isolation. We enforce in *two* places:
1. **Wrapper layer** (`packages/memory/src/index.ts`) — every public function takes `orgId` and prefixes Zep namespace with `org:<orgId>:`.
2. **Database layer** (`agent_memories` table) — RLS policy via `requesting_org_id()`.

Belt and suspenders. If either layer is bypassed, the other catches it.

## Embeddings

We use **OpenAI `text-embedding-3-small`** (1536 dims) for `agent_memories.embedding`. Set `OPENAI_API_KEY`. Zep handles its own internal embedding store; the column on `agent_memories` is for our HNSW-backed `get_relevant_memories` MCP tool, separate from Zep's graph search.
