# Operator dashboard pages

> Day-7 ship. Server-rendered pages for the operator surface.

## Page list

| Route                       | What it shows                                                          | Data source                                                |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/` and `/today`            | Daily snapshot: headline, 3-card grid, flags+anomalies, sync, AI summary | `daily_metrics`, `reconciliation_flags`, `anomalies`, `data_connections`, `connection_alerts`, `reports` |
| `/metrics`                  | Tremor charts (revenue, ROAS·MER, orders·new customers, refund rate)   | `daily_metrics` (range = 7/30/90d via `?range=N`)          |
| `/analyst`                  | Browser chat with the operating CFO                                    | `apps/api/api/agent/chat` → `createAgent({...}).chat()`    |
| `/exports`                  | CSV/XLSX downloads (metrics, flags, anomalies)                         | `apps/api/api/exports/[kind]`                              |
| `/settings/connections`     | OAuth connection management                                             | (Day-1 ship — unchanged)                                   |
| `/settings/reconciliation`  | Reconciliation flag triage                                              | (Day-6 ship — unchanged)                                   |
| `/settings/team`            | Clerk org members + delivery-pref form                                 | Clerk `OrganizationProfile`, `org_settings`                |

## Empty states

Every page degrades gracefully when there's no data:

- `/today` — renders a "Connect your data" card with a CTA to `/settings/connections`.
- `/metrics` — renders a "No data yet" card; the range switcher is still usable.
- `/analyst` — empty conversation prompts a hint message, no spinner; transport failure returns a polite degraded reply, never a 500.
- `/exports` — always renders; a download with zero rows still produces a valid empty CSV/XLSX.
- `/settings/team` — falls back to documented defaults if `org_settings` row is missing; the first save creates the row.

## Sidebar alert badges

Two counters live in the layout (`apps/app/app/(authenticated)/layout.tsx`) and are passed as props to the client sidebar so it never imports server-only code:

- **Connections** — red dot when `connection_alerts.resolved_at IS NULL`.
- **Reconciliation** — yellow dot when `reconciliation_flags.status IN ('open', 'investigating')`.

Counts are wrapped in try/catch — a transient DB hiccup zeroes them out rather than 500-ing the entire authenticated layout.

## Iron rules upheld

- Iron rule #1 (AI never computes numbers): all displayed numbers come from DB columns or `packages/metrics`. The dashboard formats numbers; it never derives new ones outside the explicit `computePctDelta` helper, which only operates on DB-sourced values.
- Iron rule #2 (RLS): every query is `eq(table.orgId, orgId)`-scoped. Drizzle's `database` client also injects the JWT-derived RLS predicate.
- Iron rule #6 (grounding): the `/analyst` chat passes through `validateChatGroundingLight`, which warns via stderr but does NOT throw — the chat surface is conversational, not a published artifact. Daily-report grounding remains strict.

## Adding a new page

1. Create the route under `apps/app/app/(authenticated)/<area>/page.tsx`.
2. Add the nav item to `WORKSPACE_ITEMS` or `SETTINGS_ITEMS` in `apps/app/app/(authenticated)/components/sidebar.tsx`.
3. Authorize: `const { orgId } = await auth(); if (!orgId) redirect("/sign-in");` (or `notFound()` deeply nested).
4. Defensively scope every query: `where(eq(table.orgId, orgId))`.
5. Prefer server components. Client components only for interactivity.
6. Add a deterministic empty state — the page must render before the operator has connected sources.

## API surfaces added

- `POST /api/agent/chat` — body `{ messages: ChatMessage[] }`, returns `{ message, traceId, citations }`.
- `GET /api/exports/[kind]` — `kind ∈ {metrics-csv, metrics-xlsx, flags-csv, anomalies-csv}`. Auth via Clerk; pino-logged with row count.

## Known TODOs

- SSE streaming for `/api/agent/chat` (v1 is JSON; sufficient for ergonomic UX, less so for long answers).
- Replace tagged-transcript packing in `agent.chat()` with a multi-turn-aware `AgentTransport` once the production transport supports it.
- Page-level `.test.tsx` coverage. Day-7 prioritized package-level tests (`packages/agent/tests/agent-chat.test.ts`).
