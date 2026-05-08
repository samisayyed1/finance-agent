# Day 7 — Operator dashboard

## What shipped

- **Sidebar rewrite** (`apps/app/app/(authenticated)/components/sidebar.tsx`) — 7 nav items in two groups, alert badges (red on Connections from `connection_alerts`, yellow on Reconciliation from open/investigating `reconciliation_flags`), `usePathname()` active highlighting. Counts are passed in from the layout so the client component never reaches into server-only code.
- **`/` and `/today`** (`apps/app/app/(authenticated)/today/`) — daily snapshot with empty state, headline + 7d delta, 3-card metric grid, flags+anomalies card, sync-health card, and a conditional AI-summary card displaying `reports.content_md` + `aiTraceId`. Root `/` re-exports from the canonical Today path.
- **`/metrics`** (`apps/app/app/(authenticated)/metrics/`) — server-rendered Tremor 2x2 chart grid (revenue, ROAS·MER, orders·new customers, refund rate) with a 7/30/90d range switcher driven by `?range=N`.
- **`/analyst`** (`apps/app/app/(authenticated)/analyst/`) — browser chat. Calls a new `createAgent({...}).chat({messages})` runtime method exposed as `POST /api/agent/chat`. Response is rendered with inline citation badges parsed from `[snapshot:..]/[flag:..]/[anomaly:..]/[memory:..]` markers.
- **`agent.chat()` runtime** (`packages/agent/src/runtime/agent.ts`) — new chat-v1 prompt template, lightweight grounding (warn-only, never throws), graceful transport-failure degraded reply, persisted to `agent_traces` with `tool: 'chat'`.
- **`/exports`** (`apps/app/app/(authenticated)/exports/`) — page lists 4 exports, all anchored to `apps/api/app/api/exports/[kind]/route.ts`. Route uses Zod-validated `kind` enum, RLS-scoped queries, pino logging with row counts. CSV via PapaParse, XLSX via SheetJS.
- **`/settings/team`** (`apps/app/app/(authenticated)/settings/team/`) — Clerk `OrganizationProfile` for membership + a delivery-prefs form (`actions.ts` UPSERTs `org_settings`).
- **Test fixture** (`apps/app/tests/fixtures/seed-test-org.ts`) — deterministic 30-day org seed.

## What's pending

- SSE streaming for `/api/agent/chat`.
- Multi-turn-aware `AgentTransport` (current path packs the conversation into a tagged transcript single string).
- Page-level `.test.tsx` coverage.
- Hooking the analyst chat surface to the per-trace feedback widget once that lands.

## Schema changes

None. Day 7 is pure UI/API + runtime composition over the existing schema.
