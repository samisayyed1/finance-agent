# Day-2 — Stripe + reconciliation + OAuth callbacks

Bypass mode (no plan-first); retroactive log of what shipped.

## Phase 0 — preconditions + bigint fix
- Generated `DATA_CONNECTION_ENCRYPTION_KEY` (AES-256, base64) and added to `.env.local` (never printed).
- Verified all 6 Day-1 tables exist via psql.
- **Bigint-safe JSON parser** (Day-1 TODO #1):
  - Added `lossless-json 4.3.0` to `packages/connectors/shopify` and `apps/api`.
  - New `packages/connectors/shopify/src/parse/json-bigint.ts` exports `parseJsonBigintSafe` — uses lossless-json with a reviver that keeps unsafe-integer numerics as strings, leaves safe-integer numerics as numbers, leaves money decimal strings alone.
  - `packages/jobs/src/r2-fetch.ts` now uses `parseJsonBigintSafe` on payloads pulled from R2.
  - New test `parse-event.test.ts > bigint-safe JSON parse`: a 19-digit order id (>2^53) round-trips through parse + canonical mapping verbatim.
- **Connector.verifyWebhook widened to async** (Day-1 TODO #3): `packages/shared/src/connector.ts` returns `Promise<boolean>`. Stub connectors (meta, google, stripe) updated. Shopify connector's `verifyWebhook` now wraps `verifyShopifyWebhook` directly (no more sync stub). Day-1 ingress route already used the async export, so this is a typing tightening with no runtime change.

## Phase 1 — OAuth callback routes + dashboard `/settings/connections`
- New shared OAuth-state primitive `packages/shared/src/oauth-state.ts`: `buildOAuthState({ orgId, source, extra, secret })` + `verifyOAuthState({ state, secret, expectedSource })` with constant-time compare and 5-minute TTL. Lives in `@ai-cfo/shared` so any connector reuses one canonical implementation.
- `apps/api/app/oauth/shopify/callback/route.ts`: GET handler verifies state, exchanges code via `exchangeCode`, encrypts token, upserts `data_connections` with `source_metadata.shop_domain`, enqueues `ai-cfo.shopify-backfill`, redirects to dashboard.
- `apps/api/app/oauth/stripe/callback/route.ts`: GET handler verifies state, calls `connect.stripe.com/oauth/token` directly with form-encoded `client_secret + code + grant_type=authorization_code`, encrypts token via the same AES-256-GCM envelope, upserts `data_connections` with `source_metadata.stripe_account_id + livemode`, enqueues `ai-cfo.stripe-backfill`, redirects.
- `apps/api/app/api/connections/[source]/initiate/route.ts`: POST handler authed via Clerk; for `shopify` requires a `{shop}` body; for `stripe` no body needed. Builds the source-specific authorize URL with shared state HMAC. Returns `{ authorizeUrl }`.
- `apps/app/(authenticated)/settings/connections/page.tsx`: server component reads `data_connections` for the current org, renders 8 source cards (Shopify + Stripe live; the rest are "Coming soon"). Client component `connection-row.tsx` fetches the initiate endpoint and redirects on click.
- New migration `20260507202729_data_connections_unique_org_source.sql` adds `unique(org_id, source)` so the OAuth callback's `ON CONFLICT (org_id, source) DO UPDATE` upsert works.

## Phase 2 — Stripe connector real implementation
- `packages/connectors/stripe/src/canonical/types.ts`: `NormalizedStripePayment | NormalizedStripeRefund | NormalizedStripePayout` shapes that map onto canonical `payments` / `refunds` / `payouts` tables. `STRIPE_WEBHOOK_TOPICS = [charge.succeeded, charge.refunded, charge.dispute.created, payout.created/paid/failed]`.
- `parse/schemas.ts`: strict Zod for `Stripe.Charge`, `Stripe.Refund`, `Stripe.Payout`, `Stripe.Dispute`, `Stripe.Event`. Schema drift fails loud per Iron Rule #1.
- `parse/index.ts::parseStripeEvent`:
  - `charge.succeeded` → 1 Payment with cent-exact gross/fee/net from `balance_transaction` (when expanded).
  - `charge.refunded` → 1 Payment (re-upsert) + N Refund rows from `charge.refunds.data`.
  - `payout.created/paid/failed` → 1 Payout with status + arrival timestamps.
  - `charge.dispute.created` → 0 events (Day-2 log only; disputes table is Day-3).
  - Lifts `metadata.shopify_order_id` into `sourceOrderId` so the matcher has a free hint.
- `webhook/verify.ts`: wraps the Stripe SDK's `webhooks.constructEventAsync` (HMAC SHA-256 + 5-min replay tolerance).
- `oauth/index.ts`: `authorizeUrl({ orgId, config })` and `exchangeCode({ code, state, config })` using the shared state primitive.
- `backfill/iterator.ts`: async generators `backfillCharges` and `backfillPayouts` against the Stripe SDK with `created: { gte }` cursor and SDK-managed retries on 429.

## Phase 3 — Stripe webhook ingress
- `apps/api/app/webhooks/stripe/route.ts`: identical idempotent shape to the Shopify route — read raw body, verify signature, resolve org via `data_connections.source_metadata->>'stripe_account_id' = event.account`, ON CONFLICT DO NOTHING into `raw_payloads`, R2 upload, Trigger.dev enqueue. Sub-5s end to end.

## Phase 4 — Trigger.dev tasks
- `packages/jobs/src/stripe-apply.ts`: source-agnostic Stripe upsert, links payments back to existing Shopify orders by `metadata.shopify_order_id` (when present); refunds link back to payments by `(orgId, source='stripe', source_payment_id)`.
- `packages/jobs/src/stripe-normalize.ts`: schema task that re-fetches raw from R2 (via the bigint-safe parser), parses, applies, marks raw_payloads.processed_at, and enqueues `compute-daily-metrics` + `reconcile-day` for affected dates.
- `packages/jobs/src/stripe-backfill.ts`: pages charges + payouts, lands each into `raw_payloads` + R2 (idempotent on event_id) and applies inline. Wraps the Stripe.Event shape so the same `parseStripeEvent` works for both webhook and backfill paths.
- `packages/jobs/src/compute-daily-metrics.ts`: schema task wrapping `@ai-cfo/metrics.computeDailyMetrics`. Idempotent.
- `packages/jobs/src/reconciliation.ts`: `reconcile-day` (single-day) + `reconcile-window` (multi-day) wrappers around `@ai-cfo/reconcile.runReconciliation`.

## Phase 5 — `compute_daily_metrics` extended
- `fees` = sum(stripe payments.fee_amount) where status='succeeded' AND processed_at::date = date.
- `revenue_net` = revenue_gross − refunds_today − fees_today (was just gross − refunds in Day-1).
- `contribution_profit` = revenue_net − COGS_stub (COGS_stub = 0 until QuickBooks/Xero connector ships; flagged audit string).
- `pending_source_connection` updated to mention COGS=0 stub explicitly.
- Day-1 tests retro-fitted to the new shape (fees → "0.00", contribution_profit → matches revenue_net).

## Phase 6 — first reconciliation flags
- `packages/reconcile/src/match.ts::matchOrdersToPayments` — pure, source-agnostic. Greedy match by smallest |Δamount| then |Δtime|. Defaults: 1¢ amount + 30-min time tolerance. Per-org overrides via `org_thresholds` deferred to Day-3.
- `packages/reconcile/src/runReconciliation.ts` — DB-bound runner: loads paid Shopify orders + succeeded Stripe payments within window (payments window slightly widened ±30 min to catch boundary slips), calls the matcher, upserts `ORDER_MISSING_PAYMENT` / `PAYMENT_WITHOUT_ORDER` / `FEE_DRIFT` flags via `ON CONFLICT (flag_id) DO NOTHING` (idempotent).
- New Drizzle schema for `reconciliation_flags`.
- Universal-extensibility guard: a test verifies the matcher handles `qb-invoice-1 ↔ plaid-deposit-1` with zero matcher changes.

## Phase 7 — tests
- 7 real Stripe webhook fixtures vendored.
- **Stripe verify-webhook** (5 tests): valid sig, invalid sig, body mutation, replay (>5min), missing v1.
- **Stripe parse-event** (8 tests): charge.succeeded cent-exact gross/fee/net + metadata.shopify_order_id lift; charge.refunded → Payment + Refund linked; charge.dispute.created → 0 events; payout.created/paid/failed each → 1 Payout; application_fee_amount fixture.
- **Stripe normalize** (4 tests, live Supabase): idempotent upserts, refund-to-payment linkage, payout upsert, dispute log.
- **Match** (9 tests, pure): perfect match, missing payment, payment without order, 1¢ tolerance match, 2¢ no-match, 25-min tolerance match, 35-min no-match, two-pair greedy, source-agnostic invariant.
- **Run-reconciliation** (3 tests, live Supabase): empty window → 0 flags; 5 orders / 4 payments → 1 ORDER_MISSING_PAYMENT (idempotent); 4 orders / 5 payments → 1 PAYMENT_WITHOUT_ORDER.
- **Revenue-net-with-fees** (6 tests, cent-exact): 8 orders + $29 fees → revenue_net $971; with $100 refund → $871; $0 gross + $29 fees → -$29; Stripe refund of $100 with $3.20 fee → -$3.20; non-succeeded statuses ignored; contribution_profit math.
- **Bigint round-trip** (2 tests): 19-digit ids preserved verbatim through parse + canonical; small ids stay numbers.
- Day-1 tests still pass (Shopify connector 18 → 20, Shopify normalize 5, Shopify metrics 12 → 13).

## Phase 8 — docs (this file)
- `docs/runbooks/STRIPE_CONNECT_SETUP.md` — Connect Standard, redirect URIs, webhook subscriptions, env fill, install flow, prod hardening TODOs.
- `docs/runbooks/RECONCILIATION_OPERATIONS.md` — matcher tolerance defaults, per-org override path (Day-3), how operators resolve flags, idempotency invariant.
