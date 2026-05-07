# Hookdeck — webhook routing for Shopify / Stripe / Meta / Google

Hookdeck sits between the source platforms and our `apps/api/app/webhooks/*` routes. It buffers, retries, and de-duplicates so an unreachable API doesn't drop events.

## Setup
1. Create a project per env (dev / prod) at https://hookdeck.com.
2. Create one **Source** per platform: `shopify`, `stripe`, `meta`, `google`. Use the platform's webhook signing secret in Hookdeck's verification config.
3. Create one **Destination** per source pointing at our public webhook ingress (e.g. `https://api.aicfo.example/webhooks/shopify`).
4. Wire **Connections**: source → destination, with retry policy `15 attempts, exponential backoff capped at 24h` and de-dup window of `48h` keyed on the source's `event_id` header (`X-Shopify-Webhook-Id`, `Stripe-Signature`'s `t=`, etc.).
5. Save `HOOKDECK_API_KEY` and `HOOKDECK_SIGNING_SECRET` in `.env`.

## Idempotency
Iron Rule #3: webhooks idempotent by `event_id`. Our handler:
1. Verifies Hookdeck signature.
2. Verifies platform signature.
3. Inserts into `raw_payloads(org_id, source, event_id)` — `unique` constraint short-circuits duplicates.
4. Stores raw body in R2 keyed by `org_id/source/yyyy/mm/dd/event_id` (immutable).
5. Enqueues a Trigger.dev parse task.

## Reconciliation as a backstop
Webhook delivery is best-effort even with Hookdeck. Daily reconciliation jobs in `packages/reconcile` walk each connector's API and emit `PERIOD_GAP` flags for any window where webhook count diverged from API count.
