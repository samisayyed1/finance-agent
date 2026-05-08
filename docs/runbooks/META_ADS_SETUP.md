# Meta Ads — connector setup

This is what you do once per Meta App, before any operator can connect.

## 1. Create a Meta App

1. Visit https://developers.facebook.com → **My Apps** → **Create App**.
2. Use case: **Business**.
3. After creation, copy:
   - **App ID** → `META_APP_ID`
   - **App secret** → `META_APP_SECRET`
   (App secret is in **App settings → Basic** under **Show**.)

## 2. Add the Marketing API product

1. App dashboard → left sidebar → **Add Product** → enable **Marketing API**.
2. No further product config needed for read-only insight access; the
   permissions live on the Login product.

## 3. Configure Facebook Login for Business

1. **Add Product → Facebook Login for Business**.
2. **Settings → Valid OAuth Redirect URIs** — add:
   - `http://localhost:3002/oauth/meta/callback` (local dev — apps/api dev port)
   - `https://<prod-api-domain>/oauth/meta/callback`
3. **Settings → Client OAuth login** — keep enabled. **Web OAuth login** — enabled.
4. **App Domains** (App settings → Basic) — add the prod domain root.

## 4. Required permissions / scopes

The connector requests:
- `ads_read` — read insights and ad account metadata.
- `business_management` — list ad accounts the user can access.
- `read_insights` — daily breakdowns.

All read-only. No write permissions are requested.

## 5. App review

- **Development mode** (default): up to 25 testers can connect; fine for design-partner cohort.
- **Production**: Meta requires app review for `ads_read` and `business_management` outside dev mode. Submit via App dashboard → **App Review** → submit each permission with a 30-second screencast of the connection flow. Average review window: 5–10 business days.

## 6. .env.local

```
META_APP_ID=<app id>
META_APP_SECRET=<app secret>
# Optional — defaults to DATA_CONNECTION_ENCRYPTION_KEY if unset.
META_OAUTH_STATE_SECRET=<32+ char random>
```

## 7. Operator flow (sanity check)

1. Operator visits `apps/app/(authenticated)/settings/connections` → **Connect Meta**.
2. POST to `/api/connections/meta/initiate` returns `{authorizeUrl}`; dashboard redirects.
3. User authorizes on Meta → redirected back to `/oauth/meta/callback?code=…&state=…`.
4. Callback verifies state HMAC, exchanges short→long token, lists ad accounts, encrypts the long token, upserts `data_connections`, enqueues `ai-cfo.meta-backfill` (90-day pull).
5. After backfill: daily-report next morning shows real ad_spend / ROAS / CAC.

## 8. Diagnostics

Find a connection's stored ad accounts:
```sql
select source_metadata
from data_connections
where org_id = '<uuid>' and source = 'meta';
```

Force a re-sync without re-OAuth:
```bash
trigger.dev cli trigger ai-cfo.meta-scheduled-sync --payload '{"timestamp":"2026-05-08T02:00:00Z"}'
```

If the long-lived token expires (60-day default), the next sync's API call returns 190 — operator must re-connect via the dashboard. Day-6 will add a refresh path that surfaces this in a Slack DM.
