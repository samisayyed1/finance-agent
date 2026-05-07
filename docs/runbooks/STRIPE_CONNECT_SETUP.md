# Stripe Connect — manual setup

Day-2 ingestion needs a Stripe Connect Standard platform per environment.

## 1. Stripe Dashboard → Connect

1. Sign in at https://dashboard.stripe.com (one account per env: live + test).
2. **Connect → Settings → Platform settings** (test mode):
   - **Integration type**: Standard.
   - **Redirect URIs**: add `https://api.<env>.aicfo.example/oauth/stripe/callback` and `http://localhost:3002/oauth/stripe/callback`.
   - Note the **client_id** (starts with `ca_…`) — paste into `.env.local` as `STRIPE_CLIENT_ID`.

## 2. Webhook endpoint

In **Developers → Webhooks → Add endpoint** (do this in test mode first):

- **Endpoint URL**: the Hookdeck source URL for Stripe (see HOOKDECK_SHOPIFY_ROUTING.md → `## Stripe routing` for parallel setup) OR directly `https://api.<env>.aicfo.example/webhooks/stripe` if not using Hookdeck for Stripe.
- **Listen to**: events on **Connected accounts**.
- **Events to send**:
  - `charge.succeeded`
  - `charge.refunded`
  - `charge.dispute.created`
  - `payout.created`
  - `payout.paid`
  - `payout.failed`
- Reveal the signing secret (`whsec_…`) → paste as `STRIPE_WEBHOOK_SECRET`.

## 3. Env vars

```
STRIPE_CLIENT_ID=ca_...
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... in prod)
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_REDIRECT_URI=https://api.<env>.aicfo.example/oauth/stripe/callback
```

## 4. End-to-end install flow

1. Operator visits `/settings/connections`, clicks **Connect Stripe**.
2. Browser POSTs `/api/connections/stripe/initiate` → server returns the `connect.stripe.com/oauth/authorize?...&state=<HMAC>` URL.
3. Operator authorises in their Stripe Dashboard, gets redirected to `/oauth/stripe/callback?code=…&state=…`.
4. Server verifies state HMAC, exchanges `code` at `connect.stripe.com/oauth/token`, encrypts `access_token` with AES-256-GCM via `DATA_CONNECTION_ENCRYPTION_KEY`, upserts `data_connections` (with `source_metadata.stripe_account_id`).
5. Server enqueues `ai-cfo.stripe-backfill` with the connection id.
6. Backfill task pages `charges.list({ created: { gte: ninetyDaysAgo } })` and `payouts.list(…)`, lands each in `raw_payloads` + R2, then calls `applyStripeEvents` for canonical upsert.
7. Operator lands on `/settings/connections?source=stripe&status=connected`.

## 5. Connect-event routing in webhooks

For Connect events, Stripe sets `event.account = acct_…`. Our `apps/api/app/webhooks/stripe/route.ts` resolves the org via:

```sql
select org_id
from data_connections
where source = 'stripe'
  and source_metadata ->> 'stripe_account_id' = $1
```

If unmatched → return 410. If matched → idempotent insert into `raw_payloads` + R2 + Trigger.dev enqueue.

## 6. Production hardening — TODO before public launch

- **KMS** for `DATA_CONNECTION_ENCRYPTION_KEY` (same item as Shopify).
- **Webhook timestamp tolerance**: Stripe SDK default is 300s. We may want to widen for Hookdeck retries — verify replay-attack prevention still holds.
- **Stripe API version pinning**: we currently rely on the SDK default. Pinning `apiVersion` per env will make integration tests reproducible across SDK upgrades.
- **Refunds-of-fees**: if the merchant enables fee refunds in their Stripe Dashboard, our normalize must subtract refunded fees from `payments.fee_amount`. Currently we subtract refund amount from `payments.amount_refunded` only — Day-3 polish.
