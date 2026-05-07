/**
 * Shopify backfill orchestration.
 *
 * Each yielded raw event from `backfillOrders` is treated identically to a
 * webhook delivery: it lands in `raw_payloads` (with topic 'backfill.order')
 * and gets routed through `shopify-normalize` for canonical upsert. Same
 * code path, same idempotency, same auditability.
 */

export { backfillOrders, type RawBackfillEvent } from "./iterator";
