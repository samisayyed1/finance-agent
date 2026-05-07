# Cloudflare R2 — raw payload storage

Iron Rule #4: Raw API payloads live in R2 and are **immutable**. Normalized data is always rebuildable from raw.

## Bucket layout
- One bucket per env: `ai-cfo-raw-dev`, `ai-cfo-raw-prod`.
- Object key format: `{org_id}/{source}/{yyyy}/{mm}/{dd}/{event_id}.json`.
  - Example: `7c4c…b9a1/shopify/2026/05/07/abcd-1234.json`.
- Metadata: `Content-Type: application/json`, custom headers `x-source`, `x-event-id`, `x-received-at`.
- **Object Lock / immutability**: enable governance-mode retention with a 7-year minimum (financial audit trail).

## Setup
1. Create bucket in Cloudflare R2 dashboard.
2. Generate API token scoped to that bucket; set in `.env.local`:
   - `R2_ACCOUNT_ID` (Cloudflare account ID).
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET` (the bucket name itself, e.g. `ai-cfo-raw-dev`).
3. Configure Object Lock with governance mode: **7-year retention** (matches financial audit norms; CFO clients regulated by IRS, HMRC, etc. expect this).
4. Lifecycle rule: transition to **Infrequent Access** storage class after 30 days (raw payloads are rarely read after the first week; saves ~50% on storage cost).

## Code path
- **Webhook ingestion**: `apps/api/app/webhooks/shopify/route.ts` → `apps/api/app/lib/r2.ts::putRawPayload()` writes the raw HTTP body verbatim. Body bytes are exactly what was HMAC-signed; never re-serialized.
- **Backfill ingestion**: `packages/jobs/src/shopify-backfill.ts` → `packages/jobs/src/r2-put.ts::putRawJson()` writes JSON-stringified Admin API page entries.
- **Normalize re-fetch**: `packages/jobs/src/shopify-normalize.ts` → `packages/jobs/src/r2-fetch.ts::fetchRawPayload()` reads via the `r2_key` column on `raw_payloads`.
- The DB row's `raw_payloads.r2_key` is the only mutable pointer; the R2 object itself is never updated.

## Key partition rationale
- `org_id/` first → bulk export per tenant is one prefix-listing.
- `source/` next → per-vendor replay flows.
- `YYYY/MM/DD/` keeps directory listings tractable (Shopify-only brands at $1M/mo do ~100–500 webhooks/day; that's a manageable number per leaf prefix).
- `{event_id}.json` is globally unique within the partition (Shopify webhook ids are GUID-shaped).

## Disaster recovery
- Replicate to a second R2 region weekly via Cloudflare's bucket replication.
- **Postgres rebuild test** (quarterly): nuke a test org's `orders`/`payments`/`refunds`, re-run the normalize pipeline against R2 raw payloads, diff `daily_metrics` against the snapshot taken before the nuke. Iron Rule #4 invariant: this diff must be empty.

## Manual Day-1 checklist for Sami
- [ ] Cloudflare R2 enabled on the account (free tier covers Day-1 volume).
- [ ] Two buckets created: `ai-cfo-raw-dev`, `ai-cfo-raw-prod`.
- [ ] Object Lock = governance, 7 years (per env).
- [ ] API token scoped to each bucket; secrets pasted into the matching `.env.<env>` file.
- [ ] Region replication enabled for prod bucket.
