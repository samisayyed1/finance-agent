# ADR 0017 — Scheduled sync over webhooks for ad platforms

## Status
Accepted — 2026-05-08

## Context
Day 5 added Meta Marketing API + Google Ads as truth sources for ad spend, ROAS, MER, and CAC. Both platforms expose:

- **Meta**: webhook subscriptions exist for *user-side* events (page-mention, lead form submission, ad-account-disabled). They do **not** push daily insight metrics. The Marketing API "real-time updates" you might hope for don't exist for spend/conversions/impressions.
- **Google Ads**: no realtime push for metrics. Conversion data lands via the Google Ads UI / GAQL after batch processing on Google's side. Streaming reports are an enterprise-only API.

Our daily-report cadence runs at the operator's local 07:00 (org_settings). Anything fresher than "yesterday's metrics ingested by 02:00 UTC" is wasted precision for the product surface.

## Decision

**Polling, not webhooks.** Two scheduled Trigger.dev tasks:

| Job | Cron | Window |
| --- | --- | --- |
| `ai-cfo.meta-scheduled-sync` | `0 2 * * *` | last 7 days, all active Meta connections |
| `ai-cfo.google-scheduled-sync` | `15 2 * * *` | last 7 days, all active Google connections |

Plus on-OAuth backfill — `ai-cfo.meta-backfill` and `ai-cfo.google-backfill` — which pulls 90 days at connection time.

The 7-day rolling window catches Meta's attribution lag (Meta attributes purchases up to 7 days post-click; today's spend may pick up sales tomorrow). Idempotency guarantee: every upsert keys on `(org_id, source, campaign_id, date)` so re-pulling the same window has no double-counting risk.

The 15-minute stagger between jobs spreads Trigger.dev worker load and keeps both inside the daily-report compute window (which fires at the operator's local 07:00 ≥ 02:30 UTC for any sane US/EU timezone).

## Consequences

- **Eventual consistency window**: up to 24h for new ad spend to land in `daily_metrics`. The daily report runs after the sync, so the operator never sees stale data on the morning report.
- **Higher API quota usage** than webhooks would imply, but: Meta's Insights quota is generous (200 calls/hour/account) and our 7-day pull is one paginated call per ad account. Google Ads basic-access quota is 15k operations/day, our daily pull is one query per customer. Both well inside free tiers for design-partner cohort.
- **Re-processable from R2**: if a parser bug ships, we re-queue the affected `meta-normalize` / `google-normalize` jobs against the immutable raw payloads.
- **Hourly granularity is out of scope**: if a customer demands intra-day insights (e.g. "alert me when ROAS dips below 2 for two hours"), we tighten the cron to `*/15 * * * *` with rate-limit awareness. Day-5 doesn't ship this; the substrate supports it.

## Alternatives considered

- **Long-poll webhooks via a marketplace integration partner** (e.g. Triplewhale, Northbeam): rejected. Their data is one of *our* outputs, not an input — operators who already have these tools don't need us; operators who don't have them need us *to be* this layer.
- **Event-time live ingestion via Google Ads Streaming Reports**: enterprise-API, not available at design-partner scale. Re-evaluate at Series A.

## Related
- `packages/jobs/src/meta-scheduled-sync.ts`
- `packages/jobs/src/google-scheduled-sync.ts`
- `packages/connectors/meta/src/backfill.ts`
- `packages/connectors/google/src/backfill.ts`
