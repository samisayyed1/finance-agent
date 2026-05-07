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
2. Generate API token scoped to that bucket; set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in `.env`.
3. Configure Object Lock with governance mode: 7 years.
4. Set lifecycle rule: transition to Cold storage after 30 days (cuts cost; raw payloads aren't read often).

## Code path
- Webhook handler in `apps/api/app/webhooks/<source>/route.ts` writes to R2 via `@aws-sdk/client-s3` (R2 is S3-compatible).
- The DB row in `raw_payloads.r2_key` is the only mutable pointer; the object itself is never updated.
- Reconciliation / replay jobs read R2 via the same key path.

## Disaster recovery
- Replicate to a second R2 region weekly via Cloudflare's bucket replication.
- Postgres rebuild test (quarterly): nuke `agent_traces` for a test org, replay raw payloads through the parse + reconcile pipeline, diff `daily_metrics` against the replica before the nuke.
