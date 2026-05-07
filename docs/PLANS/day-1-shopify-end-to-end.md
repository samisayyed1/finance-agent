# Day-1 — Shopify end-to-end

Bypass mode (no plan-first); retroactive log of what shipped.

## Phase 0 — push Day-0 + preconditions
- Verified `.env.local` (5 keys, lengths-only).
- `psql DATABASE_URL` round-trip ✅.
- Day-0 migration `20260507180823_clerk_org_rls_and_closed_loop.sql` applied via psql (not `supabase db push` — no `supabase/config.toml` and the project wasn't linked; psql apply is idempotent because the migration uses `IF NOT EXISTS` everywhere).
  - In-flight fix: the `pages` policy block referenced `public.pages` which didn't exist yet → wrapped in `do $$ if to_regclass('public.pages') is not null then … end$$`. Committed as `5cb182a fix(migration): guard pages-policy block behind to_regclass check`.
- Pushed Day-0 to `samisayyed1/finance-agent` over HTTPS via `gh auth setup-git` (SSH key was for the `sami-arkem` account; gh CLI is signed in as `samisayyed1` so HTTPS + token works).
- CI registered the workflow on the initial push but didn't auto-run (GitHub Actions sometimes indexes a workflow on the same push that introduces it without firing it). Phase 9's push will trigger.

## Phase 1 — canonical schema
- Migration `20260507193411_canonical_orders_payments_refunds.sql` adds:
  - `orders`, `order_line_items`, `payments`, `refunds`, `payouts` (source-agnostic, `source_metadata jsonb` for vendor specifics).
  - Augments `raw_payloads` with `processed_at` (Phase 4 needs it).
  - Augments `data_connections` with `source_metadata jsonb` (Shopify stores `shop_domain` here).
  - Indexes per spec.
  - RLS by `org_id = requesting_org_id()` on all new tables.
  - Authenticated grants.
- Drizzle schemas in `packages/database/src/schema/{orders,connections,metrics,organizations}.ts`. Re-exported from `@ai-cfo/database`.

## Phase 2 — Shopify connector
Real implementation under `packages/connectors/shopify/src/`:
- `parse/schemas.ts` — strict Zod for Shopify orders/refunds/uninstall payloads.
- `parse/money.ts` — decimal-string ↔ minor-units (refuses to silently round >2dp).
- `parse/index.ts` — canonical mapping (Order, Payment, Refund). Bigint-safe ID handling TODO documented inline.
- `webhook/verify.ts` — HMAC SHA-256 via WebCrypto, constant-time compare.
- `oauth/state.ts` — HMAC-signed state (orgId|shop|nonce|expiresAt) with 5-minute TTL.
- `oauth/encryption.ts` — AES-256-GCM envelope for credentials at rest. Day-1: env-var key. **TODO: KMS.**
- `oauth/index.ts` — `authorizeUrl()` and `exchangeCode()` with shop-domain validation and scope handling.
- `backfill/iterator.ts` — async generator over `/admin/api/2025-10/orders.json`, leaky-bucket-aware via `X-Shopify-Shop-Api-Call-Limit`, `link: rel=next` pagination.
- `index.ts` — `Connector<RawEvent, NormalizedEvent>` shim wiring the universal interface.

Drop the previously-pinned `@shopify/shopify-api` dep — we implemented OAuth + HMAC directly (smaller footprint, exact control over rate-limit + Bun-native crypto, no Bun/Node ESM mismatch).

## Phase 3 — webhook ingress
`apps/api/app/webhooks/shopify/route.ts`:
- Reads raw body before any JSON parse.
- Verifies HMAC; rejects 401 on miss.
- Resolves `org_id` from `data_connections.source_metadata->>shop_domain`; 410 if no match.
- `INSERT … ON CONFLICT DO NOTHING` on `raw_payloads(org_id, source, event_id)` — idempotent dedup.
- Uploads raw body to R2 via `apps/api/app/lib/r2.ts::putRawPayload()`.
- Enqueues Trigger.dev `ai-cfo.shopify-normalize` (dynamic import to avoid trigger.dev SDK in dev hot path when not configured).
- Returns 200 within Shopify's 4s SLA.

New deps in `apps/api`: `@aws-sdk/client-s3 3.1044.0`, `@trigger.dev/sdk 4.4.5`, `pino 10.3.1`, `@ai-cfo/connector-shopify`.

## Phase 4 — Trigger.dev normalize
`packages/jobs/src/shopify-normalize.ts`:
- Schema-task with Zod input validation.
- Fetches raw payload from `raw_payloads` + R2.
- Parses via `parseEvent({ orgId, rawPayload, topic })`.
- Calls `applyNormalizedEvents(events)` (separately exported pure function, tests can drive it without Trigger.dev runtime).
- Marks `raw_payloads.processed_at = now()`.
- Triggers `ai-cfo.compute-daily-metrics` for affected dates.

`shopify-apply.ts` does the idempotent ON CONFLICT DO UPDATE upserts on `orders`, `order_line_items`, `payments`, `refunds`. Resolves `payment.order_id` and `refund.order_id` by `(orgId, source, sourceOrderId)` lookup.

## Phase 5 — backfill
`packages/jobs/src/shopify-backfill.ts`:
- Loads `data_connections` row, decrypts `encrypted_credentials` with AES-256-GCM.
- Creates `sync_runs(kind='backfill')` row.
- Iterates `backfillOrders({ shop, accessToken, since: ninetyDaysAgo })`.
- For each event: writes to R2 (deterministic key `backfill:<order_id>`), inserts into `raw_payloads` with `ON CONFLICT DO NOTHING`, enqueues `ai-cfo.shopify-normalize`.
- Updates `sync_runs.items_processed` every 50 items.
- On finish (incl. errors): updates `sync_runs.finished_at`, `errors_jsonb`, and `data_connections.last_synced_at`.

Same code path, same idempotency, same auditability as webhooks.

## Phase 6 — compute_daily_metrics (real)
`packages/metrics/`:
- `money.ts`: decimal-string ↔ Dinero.js v2.0.2; refuses >2dp; supports USD only Day-1 (other ISO 4217 scale-2 currencies are a 1-line add).
- `compute-daily-metrics.ts`: `computeShopifyDailyMetricsFromRows()` — pure function tested with cent-exact assertions.
- `index.ts`: `computeDailyMetrics({ orgId, date, source })` — wraps the pure function with Drizzle queries against `orders` (filtered by `created_at_source` UTC day) + `refunds` (filtered by `processed_at` UTC day), upserts `daily_metrics` `ON CONFLICT (org_id, date) DO UPDATE`.
- Snapshot id format: `{orgId}-{YYYY-MM-DD}-{ISO timestamp}`.
- All non-Shopify-derivable fields explicitly null with `pending_source_connection` audit list per Iron Rule #1 (no fake numbers).

## Phase 7 — tests
- `packages/connectors/shopify/tests/verify-webhook.test.ts` — 7 tests: valid HMAC, invalid HMAC, wrong secret, body mutation, missing header, non-base64 header, Uint8Array body.
- `packages/connectors/shopify/tests/parse-event.test.ts` — 11 tests across all 6 fixtures: orders/create cent-exact totals + line items + source_metadata, orders/paid → Order + Payment, orders/cancelled, orders/updated, refunds/create, app/uninstalled (zero events), schema-drift detection (malformed payload + >2dp price guard).
- `packages/connectors/shopify/fixtures/*.json` — 6 real-shape Shopify webhook payloads. IDs stored as strings to dodge JSON-bigint precision loss; matches Shopify Admin GraphQL API behavior.
- `packages/metrics/tests/revenue-gross-shopify.test.ts` — 12 cent-exact tests: 12-orders + 3-refunds day = $1,234.56 / $1,111.11 / aov $92.59; zero-orders; all-cancelled; refund-of-yesterday-order; non-shopify-source filter; pure-function-trusts-caller invariant.
- `packages/jobs/tests/shopify-normalize.test.ts` — 5 tests against live Supabase: idempotent re-application; orders/paid status flip + Payment insert; orders/updated preserves line items; refunds/create attaches to order; orders/cancelled re-upsert. Vitest `server-only` shim added to allow `@ai-cfo/database` import in test env.

## Phase 8 — docs (this file plus runbooks)
- `docs/runbooks/SHOPIFY_PARTNER_APP_SETUP.md` — Partner Dashboard config, scopes, webhook subscriptions, env vars, prod hardening TODOs.
- `docs/runbooks/HOOKDECK_SHOPIFY_ROUTING.md` — Hookdeck source/destination, retry policy, dedup window, idempotency invariants, on-call.
- `docs/runbooks/R2_BUCKETS.md` — expanded with Day-1 code paths, key partition rationale, manual checklist.
