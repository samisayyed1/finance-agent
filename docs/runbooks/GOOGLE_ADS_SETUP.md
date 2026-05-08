# Google Ads — connector setup

## 1. Create a Google Cloud project + OAuth client

1. https://console.cloud.google.com → new project (e.g. "AI Operating CFO").
2. **APIs & Services → Library** → enable **Google Ads API**.
3. **OAuth consent screen** → External; add scopes `https://www.googleapis.com/auth/adwords`. Add yourself + design-partner emails as test users.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized redirect URIs:
     - `http://localhost:3002/oauth/google/callback`
     - `https://<prod-api-domain>/oauth/google/callback`
5. Copy:
   - **Client ID** → `GOOGLE_ADS_CLIENT_ID`
   - **Client secret** → `GOOGLE_ADS_CLIENT_SECRET`

## 2. Request a Google Ads developer token

This is the slow gate. Allow 1–3 business days.

1. Visit https://ads.google.com/aw/apicenter (must be signed in to a Google Ads account that has API access).
2. Click **API Center** → **Apply** for a developer token.
3. Form requires:
   - App name + URL.
   - Use case: "Operating CFO daily insights aggregation for ecommerce brands."
   - Compliance: read-only, no automation of bid changes, no end-user data resale.
4. The token is issued in **test access** mode initially — works only against accounts on Google's API test allowlist. Day-5 fine for development.
5. Once production-ready: **Apply for Basic Access** in the API Center. Google reviews; typical 5–10 business days.

Set:
```
GOOGLE_ADS_DEVELOPER_TOKEN=<token>
```

## 3. .env.local

```
GOOGLE_ADS_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=GOCSPX-<secret>
GOOGLE_ADS_DEVELOPER_TOKEN=<dev token>
# Optional — defaults to DATA_CONNECTION_ENCRYPTION_KEY.
GOOGLE_OAUTH_STATE_SECRET=<32+ char random>
```

## 4. MCC (manager) account support

If the operator manages Google Ads via an MCC, the OAuth flow will return a `login_customer_id` separate from the actual customer's id. Day-5 stores `null` for `login_customer_id` and Day-6+ ships a customer-pick screen on the dashboard. Until then: customers connecting via MCC will only see their first non-manager customer's data.

## 5. Operator flow

1. Operator clicks **Connect Google Ads**.
2. POST `/api/connections/google/initiate` → returns Google OAuth URL with `access_type=offline&prompt=consent` (required to receive a `refresh_token`).
3. User authorizes → redirected to `/oauth/google/callback`.
4. Callback verifies state, exchanges code → `{access_token, refresh_token}`, encrypts the **refresh_token** (the access_token expires in ~1h and we mint fresh on demand via google-ads-api), upserts `data_connections`.
5. `ai-cfo.google-backfill` enqueues at OAuth time but exits early ("no customer ids — discovery pending") because customer enumeration runs via google-ads-api at job time. Day-6 adds the discovery + customer-pick UI; for Day-5 dev, manually populate `data_connections.source_metadata.customer_ids` with the operator's customer id (numeric, no dashes).

## 6. Diagnostics

```sql
-- See what's currently connected for an org.
select source_metadata
from data_connections
where org_id = '<uuid>' and source = 'google';
```

```bash
# Force a re-sync.
trigger.dev cli trigger ai-cfo.google-scheduled-sync \
  --payload '{"timestamp":"2026-05-08T02:15:00Z"}'
```

Any 401/403 errors from google-ads-api almost always mean the developer token is still in test mode. Apply for **Basic Access** before going live.
