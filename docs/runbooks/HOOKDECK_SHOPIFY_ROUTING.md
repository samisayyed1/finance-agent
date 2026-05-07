# Hookdeck — Shopify webhook routing

Shopify auto-deletes webhook subscriptions after 8 consecutive failed deliveries. Hookdeck sits between Shopify and our `apps/api` to buffer, retry, and de-dup, decoupling Shopify's intolerance from our occasional outages.

## 1. Hookdeck dashboard setup

Per environment:

1. Sign in at https://dashboard.hookdeck.com (use the `samisayyed1` account).
2. **Sources → New → Shopify managed**.
   - Hookdeck issues a public URL of the form `https://hkdk.events/<source-id>`.
   - **Use this URL** as the webhook endpoint in Shopify Partner Dashboard (NOT our `apps/api`).
3. **Destinations → New → HTTPS**.
   - URL: `https://api.<env>.aicfo.example/webhooks/shopify`.
   - Authentication: none (HMAC verification happens at our handler from the Shopify-signed payload, which Hookdeck preserves).
4. **Connections → Source → Destination**.
   - **Retry policy**: 15 attempts, exponential backoff capped at 24h.
   - **Dedup window**: 48h, keyed on the `X-Shopify-Webhook-Id` header.
   - **Delivery timeout**: 6s (we target sub-4s in our handler; this gives buffer).

## 2. Env vars

```
HOOKDECK_API_KEY=<Hookdeck → Project Settings → API keys>
HOOKDECK_SIGNING_SECRET=<optional, only if we mount Hookdeck's own HMAC validation in front of Shopify's>
```

We don't currently validate Hookdeck's signature in addition to Shopify's, because the body Hookdeck forwards still carries Shopify's `X-Shopify-Hmac-Sha256` header (Hookdeck preserves headers verbatim). The body bytes match what Shopify signed, and our handler's HMAC verify is the security boundary.

## 3. Idempotency invariants

The webhook handler (`apps/api/app/webhooks/shopify/route.ts`) inserts into `raw_payloads (org_id, source='shopify', event_id=X-Shopify-Webhook-Id)` with a unique constraint. Duplicate deliveries (Shopify, Hookdeck retries, or our own replays) hit `ON CONFLICT DO NOTHING` and return 200 without doing more work.

## 4. Dev (without Hookdeck)

For local development without Hookdeck, point your Partner Dashboard's webhook endpoint at the localtunnel/ngrok URL forwarding to `localhost:3002/webhooks/shopify`. You'll lose retry semantics; that's fine for dev.

## 5. On-call

- Hookdeck → Connection → Events tab shows individual delivery attempts + responses.
- If our `apps/api` goes down for an extended period, Hookdeck will keep retrying for up to 24h. Recover within the window and events drain automatically.
- If recovery exceeds 24h: events fail permanently in Hookdeck; recovery path is the daily reconciliation job which re-walks the Shopify Admin API for the missing window (Day-2 work).

## Stripe routing (Day-2)

Same pattern. Per env:

1. Hookdeck → **Sources → New → Stripe managed**.
2. Hookdeck issues a public URL — paste into Stripe Dashboard's **Developers → Webhooks → Endpoint URL** for the connected-account events listener.
3. Hookdeck destination → `https://api.<env>.aicfo.example/webhooks/stripe`.
4. Same retry policy + dedup window. Dedup key: `Stripe-Signature` header's `t=` segment is per-request, so we dedup on Stripe's `event.id` after our handler sees it (the unique constraint on `raw_payloads(org_id, source, event_id)` makes this safe even without Hookdeck-level dedup).

If you skip Hookdeck for Stripe (acceptable in dev), point the Stripe webhook directly at `apps/api /webhooks/stripe`.
