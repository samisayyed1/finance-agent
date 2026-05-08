# Day 6 — Attribution drift + Slack OAuth + bulk-resolve UI

Retroactive log of what shipped on 2026-05-08.

## What changed

### Attribution reconciliation (the demo win)

- **`packages/connectors/shopify/src/parse/attribution.ts`** — new pure-function module.
  - `extractOrderAttribution(raw)` parses `landing_site` UTM params, `referring_site` host, and Shopify `source_name` into a typed `OrderAttribution` object.
  - `inferMarketingSource(attribution)` reduces to `'meta' | 'google' | 'tiktok' | 'klaviyo' | 'organic' | 'other'` via a deterministic precedence rule.
  - Lands inside `orders.source_metadata.attribution` at parse time. No DB migration needed (column was already jsonb).
- **`packages/reconcile/src/attribution-match.ts`** — new pure detection function.
  - `detectAttributionMismatch({orgId, date, adMetrics, orders, thresholds})` compares ad-platform-reported conversions vs UTM-attributed orders per `(date, source)`.
  - Defaults: drift ≥ 25% AND absolute delta ≥ 3 → emit. Severity scale low/medium/high.
  - Source-agnostic in spirit (iron rule #10): operates on canonical `AdMetricDailySummary` + `OrderForAttribution` shapes. No Meta/Google-specific logic in detection.
- **`packages/reconcile/src/run-reconciliation.ts`** — extended to run a per-day attribution pass after the existing order/payment passes. New flag kind `ATTRIBUTION_MISMATCH`. Flag id `ATTR_<source>_<YYYYMMDD>_<orgId8>`; ON CONFLICT (flag_id) DO UPDATE refreshes expected/actual. Idempotent on re-runs.
- **Day-5 cleanup migration** (`20260508140000_day5_corrections.sql`):
  - Added `ATTRIBUTION_MISMATCH` to the `reconciliation_flags.kind` check constraint.
  - Added `data_connections.expires_at timestamptz` + index for token-expiry monitor.
  - `daily_metrics.refund_rate` was already `numeric(8,6)` — no widening needed.
- **`packages/agent/src/contracts/daily-report.ts`** — `top_movers[].metric` and `headline.metric` tightened from `z.string()` to `z.enum([...])` with the canonical 19-metric vocabulary. `ReconciliationFlagKind` includes `ATTRIBUTION_MISMATCH`. Prompt template updated to surface attribution flags first when present and to **never recommend campaign changes based on attribution drift alone — only investigation**.

### Slack OAuth flow

- **`apps/api/app/oauth/slack/install/route.ts`** + **`callback/route.ts`** — full Slack OAuth v2 flow. Mints HMAC-signed state via `@ai-cfo/shared`, exchanges code at `https://slack.com/api/oauth.v2.access`, encrypts the bot token, upserts `data_connections` (source='slack') with `team_id`/`team_name`/`bot_user_id`/`authed_user_id` in `source_metadata`. Redirects to `/settings/connections`.
- **`packages/delivery/src/slack.ts`** — `sendSlack` now resolves bot tokens in priority order: explicit `args.botToken` → per-org install (`data_connections`) → system token only with `DELIVERY_SLACK_FALLBACK_SYSTEM_TOKEN=true`. Silent system-token fallthrough is gone (it could leak reports across orgs).

### Bulk-resolve UI

- **Migration** `20260508140100_flag_status_audit.sql`:
  - `reconciliation_flags` grows `status_changed_at`, `status_changed_by uuid`, `status_notes`, `snooze_until`.
  - Status check expanded to `('open','resolved','dismissed','snoozed','investigating')`.
  - New `flag_status_history` audit table with RLS.
- **`apps/app/(authenticated)/settings/reconciliation/page.tsx`** — server component listing flags with `kind`/`status`/date filters and 50-row pagination.
- **`apps/app/(authenticated)/settings/reconciliation/components/flag-list.tsx`** — client component with per-row checkbox, sticky bulk-action bar, and per-flag narrative renderer that branches on `kind` (ATTRIBUTION_MISMATCH gets its own operator-friendly text).
- **`apps/app/(authenticated)/settings/reconciliation/actions.ts`** — server actions `bulkUpdateFlags` + `updateFlagStatus`. Atomic transaction: SELECT prev_status, UPDATE flags + INSERT history rows in one tx; concurrent bulk updates on the same flag are serialized by Postgres row-level locks. Validates input with Zod, caps batch at 500, casts non-UUID Clerk user ids to NULL (Day-7 will add a `changed_by_external` text column).

### Token-expiry monitor

- **Migration** `20260508140200_connection_alerts.sql`: `connection_alerts` table with `(token_expiring | token_expired | rate_limited | sync_failed | manual_intervention)` kind enum, severity, optional message, RLS.
- **`packages/jobs/src/connection-health.ts`** — `classifyConnectionHealth` (pure) + `runConnectionHealthFor` (DB write) + `connectionHealthJob` (Trigger.dev `0 6 * * *` schedule). Optional Slack DM injected via `SlackDmDeps` so tests don't depend on Slack runtime.

### Drizzle schema mirrors

- `connectionAlerts`, `flagStatusHistory` added with full RLS-aware exports.
- `dataConnections.expiresAt` column added.
- `reconciliationFlags` grows `statusChangedAt`/`statusChangedBy`/`statusNotes`/`snoozeUntil`.

## Tests added

| File | Tests | Coverage |
|---|---|---|
| `packages/connectors/shopify/tests/infer-marketing-source.test.ts` | 14 | All 5 inference branches × happy + negative paths |
| `packages/connectors/shopify/tests/parse-attribution-fixtures.test.ts` | 4 | Real fixture → parse → attribution sub-object end-to-end |
| `packages/reconcile/tests/attribution-match.test.ts` | 9 | Threshold logic + severity scale + multi-source independence + custom thresholds |
| `packages/jobs/tests/connection-health.test.ts` | 6 | `classifyConnectionHealth` boundary cases (null, healthy, expiring_soon, expired, exact-7d boundary, exact-now boundary) |
| **Total Day-6 new** | **33** | |

Plus 4 vendored Shopify fixtures: `orders-create-utm-meta.json`, `orders-create-utm-google.json`, `orders-create-organic.json`, `orders-create-referring-fb.json`.

## Migrations applied (live DB)

| Migration | Status |
|---|---|
| `20260508140000_day5_corrections.sql` | ✅ Applied — ATTRIBUTION_MISMATCH in kind enum, `data_connections.expires_at` |
| `20260508140100_flag_status_audit.sql` | ✅ Applied — `flag_status_history`, status columns + expanded status enum |
| `20260508140200_connection_alerts.sql` | ✅ Applied — `connection_alerts` table |

All three verified via `information_schema` queries.

## What did NOT ship live (await credentials)

| Path | Status | Unblocks when |
|---|---|---|
| `/oauth/slack/{install,callback}` end-to-end | Code-only | `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` set + Slack app created |
| Per-org Slack delivery in production | Code-only | Same |
| `connection-health` Slack DM | Code-only (test-mocked) | Same |
| Live `ATTRIBUTION_MISMATCH` flag emission against real ad data | Code-only (fixture-tested) | Meta + Google credentials from Day 5 |

The fixture-driven test path validates everything except the actual TLS handshake to Slack/Meta/Google.

## Open TODOs surfaced

- `actions.ts` casts non-UUID Clerk user ids to NULL. Day-7+ adds a `changed_by_external text` column so the audit trail records the operator id even when it's not a uuid.
- Bulk-action UI does `window.location.reload()` after server action. Day-7+ uses `revalidatePath('/settings/reconciliation')` from the server action so the refresh is React-driven.
- `org_thresholds` row format for attribution overrides is still TBD — likely `metric='attribution_meta'`, `threshold_kind='drift_pct'`, `threshold_value=0.40` for higher-volume brands.
- Slack `/cfo` slash-command + `app_mention` + interactive-component handlers are scoped in the manifest but not yet wired in `apps/slack`. Day-7+.
- The `inferMarketingSource` heuristic is intentionally conservative: ambiguous UTMs route to `'other'` rather than guessing. Real-world reviews of operator data may show edge cases worth promoting (e.g. `utm_source=newsletter` → `klaviyo`-like behaviour for some brands).
- `connection-health` only inspects connections with `expires_at` populated. Day-5's Meta callback writes the expiry; older connections from before the Day-6 migration have NULL expires_at and are skipped. Sami can backfill via a one-off SQL update once Meta credentials land.

## Day-7 recommendation

**Live OAuth smoke + first design-partner onboarding.**

After Sami clears the credential skip-stack (Meta App ID/secret, Google OAuth + dev token, Slack app), the demo path is:

1. New brand creates Clerk org → connects Shopify, Stripe, Meta, Google, Slack via the dashboard.
2. Daily report at operator's local 07:00 includes: revenue (cited), fees (cited), refunds (cited), ad_spend (cited), ROAS (cited), MER (cited), CAC (cited), and — when there's drift — `[flag:ATTR_meta_…]` markers in the narrative.
3. Daily report lands in their Slack channel via per-org install.
4. Operator gets a 7d-out token-expiry DM the day before Meta's long-token would expire.
5. Operator reviews drift flags at `/settings/reconciliation`, clicks Snooze 7d on the structural ones.

After live smoke is clean: multi-currency FX handling (Day-5 TODO; affects brands selling in multiple regions). After that: closed-loop dashboard chart that proves grounding_rate / feature_recall / outcome_accuracy compound visibly to the operator (the chart that actually closes design partners).
