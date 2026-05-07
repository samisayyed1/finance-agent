# @ai-cfo/memory

Temporal, per-org agent memory wrapper.

## Backend

We use **Zep + Graphiti** (Apache 2.0) — chosen over Mem0 for temporal accuracy (validity windows on facts → "what was true when") and the LongMemEval result of 63.8%.

## Deployment options

- **Zep Cloud** (`@getzep/zep-cloud`) — managed, easiest to start. Set `ZEP_API_KEY`.
- **Zep Community Edition** (self-hosted via Docker) — set `ZEP_API_URL` and `ZEP_API_KEY`.

See `docs/runbooks/ZEP_DEPLOYMENT.md` for deployment specifics.

## Org isolation

Every public function takes an `orgId` and uses it as a Zep namespace prefix. Cross-tenant reads are impossible by construction; this is enforced in addition to Supabase RLS on the corresponding `agent_memories` table.

## Day-0 status

All four exports are typed stubs that throw "not implemented". Real wiring lands when Phase 5 closed-loop jobs come online.
