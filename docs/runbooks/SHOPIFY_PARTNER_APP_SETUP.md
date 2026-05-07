# Shopify Partner App — manual setup

Day-1 ingestion needs a Shopify Partner app per environment. This is a one-time, per-env setup that must be done in the Shopify Partner Dashboard. Code in this repo assumes it's done.

## 1. Partner Dashboard

1. Sign in at https://partners.shopify.com.
2. **Apps → Create app → Custom**.
3. App name: "AI CFO (dev)" / "AI CFO (prod)".
4. **App URL**: `https://app.<env>.aicfo.example` (the URL Shopify redirects to after install).
5. **Allowed redirection URLs**:
   - `https://api.<env>.aicfo.example/oauth/shopify/callback`
   - `http://localhost:3002/oauth/shopify/callback` (dev only)

## 2. App configuration → URLs + scopes

- **API access scopes** — request these (matches `SHOPIFY_OAUTH_SCOPES` in `packages/connectors/shopify/src/oauth/index.ts`):
  - `read_orders`
  - `read_products`
  - `read_customers`
  - `read_payouts`
  - `read_fulfillments`
  - `read_inventory`

## 3. Webhook subscriptions

In Partner Dashboard → app → **Configuration → Webhooks**, subscribe to these topics. Endpoint URL is the Hookdeck source URL (see HOOKDECK_SHOPIFY_ROUTING.md), NOT our app directly:

| Topic | Reason |
| --- | --- |
| `orders/create` | New orders → revenue_gross |
| `orders/paid` | Payment status → payments table |
| `orders/updated` | Status changes (financial / fulfillment) |
| `orders/cancelled` | Cancellations → revenue_gross adjustment |
| `refunds/create` | Refunds → revenue_net |
| `app/uninstalled` | Mark `data_connections` revoked |

## 4. Env vars

Fill in `.env.local`:

```
SHOPIFY_API_KEY=<from Partner Dashboard → app → Configuration → Client credentials>
SHOPIFY_API_SECRET=<from same place>
DATA_CONNECTION_ENCRYPTION_KEY=<run: openssl rand -base64 32>
SHOPIFY_REDIRECT_URI=https://api.<env>.aicfo.example/oauth/shopify/callback
```

`DATA_CONNECTION_ENCRYPTION_KEY` is the AES-256-GCM key for `data_connections.encrypted_credentials`. Day-1 it's an env var; **TODO Day-30+** migrate to a real KMS (AWS KMS / Cloudflare Workers Vault) before any production tenant.

## 5. Webhook delivery model

- Shopify auto-deletes webhook endpoints after **8 consecutive failed deliveries** — that's the headline reason we route through Hookdeck (see HOOKDECK_SHOPIFY_ROUTING.md). Hookdeck buffers + retries with exponential backoff up to 24h.
- We never trust Shopify webhook delivery alone. Daily reconciliation jobs walk the Admin REST API and flag any window where webhook count diverged from API count (Day-2 work).

## 6. Production hardening — TODO before public launch

- **Bigint-safe JSON parser** in the webhook ingress route. Shopify webhook payloads contain order/line/refund/transaction ids that exceed `Number.MAX_SAFE_INTEGER`. The Admin GraphQL API (used by the backfill path) returns these as strings already, so backfill is safe; webhook payloads still need a `lossless-json`-style parser. Tracked in `packages/connectors/shopify/src/parse/index.ts`.
- **KMS for credential encryption** — see above.
- **App Bridge / embedded app UI** — only matters if we install the AI CFO inside the Shopify admin (a future direction). Day-1 the install flow is web-based outside Shopify.

## 7. Test the install flow end-to-end (dev)

Dev store: create one in the Partner Dashboard, install the app via the install link, watch `data_connections` populate, send a test webhook from the Partner Dashboard → app → Webhooks → test, watch `raw_payloads` get a row, watch `shopify-normalize` enqueue, watch `orders` table get a row.
