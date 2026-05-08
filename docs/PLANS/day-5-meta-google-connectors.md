# Day 5 — Meta + Google ad-spend connectors

Retroactive log of what shipped on 2026-05-08.

## Goal
Close the ad-spend half of the truth layer. Brand connects Shopify + Stripe + Meta + Google → daily report shows revenue, fees, refunds, ad_spend (cited), ROAS (cited), MER (cited), CAC (cited), new_customers (cited). The agent can say "profit dropped because Meta spend up 40% but conversions flat — pause broad audience" and have every claim grounded.

## Ship status

**Code-complete, awaiting credentials for live verification.** All connector code, OAuth callback routes, scheduled-sync jobs, and the canonical schema are in place and pass typecheck/lint/test. Sami needs to:

1. Create Meta App + add `META_APP_ID`/`META_APP_SECRET` (`docs/runbooks/META_ADS_SETUP.md`).
2. Create Google Cloud project + request developer token (`docs/runbooks/GOOGLE_ADS_SETUP.md`).
3. Connect a real ad account from the dashboard.
4. Verify the next morning's report includes ad_spend / ROAS / CAC.

## What changed

### Canonical schema (new)
- `supabase/migrations/20260508130000_canonical_ad_spend.sql` — `ad_campaigns` (hierarchy via `parent_campaign_id`) + `ad_metrics_daily`, source-agnostic, RLS-isolated.
- Drizzle mirrors at `packages/database/src/schema/ad-spend.ts`.

### `packages/connectors/meta` (real)
- `src/oauth/index.ts` — `buildMetaAuthorizeUrl`, `exchangeMetaCode`, `listMetaAdAccounts`. Scopes: `ads_read,business_management,read_insights`. Short→long token swap.
- `src/parse/schemas.ts` + `src/parse/index.ts` — Zod schemas for Insights API; `parseMetaInsightRow` branches on level (campaign/ad_set/ad), sums purchase action types, preserves attribution-window data.
- `src/backfill.ts` — three-pass async iterator (campaign → adset → ad) with cursor pagination + 80%-utilization rate-limit backoff.
- `fixtures/` — 4 vendored Insights payloads (typical/zero-spend/adset/ad-creative).

### `packages/connectors/google` (real)
- `src/oauth/index.ts` — `buildGoogleAdsAuthorizeUrl`, `exchangeGoogleAdsCode`. `access_type=offline&prompt=consent` for refresh tokens.
- `src/parse/cost-micros.ts` — BigInt-safe micros → 2dp string conversion. Half-up rounding at the 4th decimal.
- `src/parse/index.ts` — GAQL row → canonical mapping; Performance Max / Shopping / Display / Search all parse identically.
- `src/backfill.ts` — `buildBackfillGAQL` + iterator with pluggable `runner` (production wires `google-ads-api`; tests inject fixtures).
- `fixtures/` — 4 vendored GAQL responses (typical/converted/shopping/paused-display).

### `apps/api` (OAuth callbacks)
- `app/oauth/meta/callback/route.ts` — verify state HMAC, exchange code, list ad accounts, encrypt long-token, upsert connection, enqueue backfill.
- `app/oauth/google/callback/route.ts` — same shape, encrypts refresh_token (access_token re-mints on demand).
- `app/api/connections/[source]/initiate/route.ts` — extended to support `meta` and `google` alongside Shopify/Stripe.

### `packages/jobs` (Trigger.dev v3)
- `meta-backfill` (schemaTask) — 90-day pull triggered at OAuth time.
- `meta-scheduled-sync` (schedule `0 2 * * *`) — 7-day rolling pull catches Meta's attribution lag.
- `google-backfill` + `google-scheduled-sync` (`15 2 * * *`) — same shape.
- `google-runner.ts` — google-ads-api SDK adapter that runs GAQL and yields raw rows for the connector parser.
- `ad-spend-apply.ts` — source-agnostic upserts into `ad_campaigns` (with parent linkage) + `ad_metrics_daily`. Two-pass ordering (campaign → ad_set → ad) so parents resolve before children.

### `packages/metrics` (Day-5 extension)
- `compute-daily-metrics.ts` — adds `ad_spend` (cross-source sum), `roas`, `blended_mer`, `cac`, `new_customers`, `refund_rate`. All cent-exact via Dinero pipeline. New `priorCustomerEmails` input for first-time-buyer detection.
- DB wrapper `index.ts` — pulls `ad_metrics_daily` for the date + builds the prior-emails set with one indexed SELECT.

### `packages/agent` (prompt update)
- `src/prompts/daily-report-v1.md` + embedded template — "When Meta or Google ad-spend data is connected, top_movers should include ROAS/MER/CAC." Steers the model away from revenue-only narratives when ad spend is present.

## Tests added

| File | Count | Notes |
| --- | --- | --- |
| `packages/connectors/meta/tests/parse-insight.test.ts` | 5 | All 4 Meta fixtures + malformed-payload negative case |
| `packages/connectors/meta/tests/oauth.test.ts` | 3 | authorizeUrl construction, mocked short→long swap, state HMAC tampering |
| `packages/connectors/meta/tests/backfill.test.ts` | 1 | Three-pass cursor iteration with mocked fetch |
| `packages/connectors/google/tests/cost-micros.test.ts` | 8 | Cents-exact conversion incl. BigInt and edge values |
| `packages/connectors/google/tests/parse-insight.test.ts` | 5 | All 4 Google fixtures + negative case |
| `packages/connectors/google/tests/oauth.test.ts` | 3 | Authorize URL, token exchange, missing-refresh-token rejection |
| `packages/connectors/google/tests/backfill.test.ts` | 3 | GAQL builder + mocked-runner iteration + missing-runner error |
| `packages/metrics/tests/new-customers.test.ts` | 5 | First-time-buyer detection across edge cases |
| `packages/metrics/tests/roas-mer-cac.test.ts` | 8 | ROAS / MER / CAC / refund_rate cent-exact assertions |
| **Total Day-5 new** | **41** | |

Plus 1 updated test (`revenue-gross-shopify.test.ts`) — the Day-2 "explicitly nulls fields" assertion was inverted now that `ad_spend` is `0.00` (not null) and `new_customers` is `0` (not null) by default.

## What was NOT verified live (await credentials)

| Path | Status today | Unblocks when |
| --- | --- | --- |
| `/api/connections/meta/initiate` → Meta authorize URL | Returns 503 server_misconfigured | `META_APP_ID`+`META_APP_SECRET` set |
| `/oauth/meta/callback` end-to-end | Code-only (OAuth state HMAC verified by tests) | Same |
| `meta-backfill` against a real ad account | Skipped — no token to decrypt | Same |
| `meta-scheduled-sync` 02:00 UTC firing | Registered, will iterate 0 active connections until first OAuth | Same |
| Same four for Google | Same | `GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN` set + dev-token approved |
| Live ROAS/MER/CAC in a daily report | Computes 0/null without ad_metrics rows | Same |

The fixture-driven test path exercises everything except the actual TLS handshake to Meta/Google.

## Open TODOs surfaced

- Google Ads customer enumeration runs at job-time via google-ads-api. For Day-5 the OAuth callback stores `customer_ids: []` — the first scheduled sync will need a discovery step. Day-6 ships an operator-pick UI at `/settings/connections`.
- Meta long-lived token expires at 60 days. No refresh path yet; expired connections silently fail until operator re-connects. Day-6 surfaces this in Slack/email.
- `purchase_roas` from Meta is captured in `roas_source` but we still compute our own — the divergence between Meta-reported and our-computed ROAS is the basis for Day-6 attribution-mismatch reconciliation.
- `ad-spend-apply.ts` handles parent_campaign_id linking but assumes parents arrive before children (the backfill iterator's level passes guarantee this; if a parser ever emits ad-set-before-campaign, parents will be null on first insert and need a follow-up pass).

## Day-6 recommendation
Ad-attribution reconciliation. Meta says X conversions; Shopify shows Y orders for the same day. The drift is a per-brand signal — some brands run Klaviyo flows that double-attribute, others have iOS-tracking gaps. Wire `meta-google-shopify-attribution-mismatch` reconciliation flags. Plus: Slack OAuth callback (the connection is wired in app code but the OAuth flow itself is still TODO from Day-3) and a bulk-resolve UI for `reconciliation_flags`.
