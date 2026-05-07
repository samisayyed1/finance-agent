import {
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookTopic,
  verifyShopifyWebhook,
} from "@ai-cfo/connector-shopify";
import { database, rawPayloads, sql } from "@ai-cfo/database";
import { logger } from "../../lib/logger";
import { putRawPayload } from "../../lib/r2";

/**
 * POST /webhooks/shopify
 *
 * Shopify (or Hookdeck in front of it) POSTs here. We:
 *   1. Read the raw body BEFORE any JSON.parse so HMAC matches.
 *   2. Verify HMAC against SHOPIFY_API_SECRET.
 *   3. Resolve org_id from data_connections by shop_domain (stored in
 *      source_metadata.shop_domain at OAuth completion time).
 *   4. Insert (org_id, source='shopify', event_id) — unique constraint
 *      idempotently dedups.
 *   5. Upload raw body to R2 (immutable audit trail; Iron Rule #4).
 *   6. Enqueue Trigger.dev `shopify-normalize`.
 *   7. Return 200 within Shopify's 4s SLA.
 */

const SHOPIFY_TOPIC_SET: ReadonlySet<string> = new Set(SHOPIFY_WEBHOOK_TOPICS);

const isShopifyTopic = (raw: string | null): raw is ShopifyWebhookTopic =>
  raw !== null && SHOPIFY_TOPIC_SET.has(raw);

const resolveOrgIdForShop = async (
  shopDomain: string
): Promise<string | null> => {
  const result = await database.execute<{ org_id: string }>(
    sql`select org_id::text as org_id
        from public.data_connections
        where source = 'shopify'
          and source_metadata ->> 'shop_domain' = ${shopDomain}
        limit 1`
  );
  const rows = result as unknown as { org_id: string }[];
  return rows[0]?.org_id ?? null;
};

export const POST = async (req: Request): Promise<Response> => {
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const topicHeader = req.headers.get("x-shopify-topic");
  const webhookId = req.headers.get("x-shopify-webhook-id");

  if (!(hmacHeader && shopDomain && topicHeader && webhookId)) {
    logger.warn(
      {
        hasHmac: !!hmacHeader,
        hasShop: !!shopDomain,
        hasTopic: !!topicHeader,
        hasId: !!webhookId,
      },
      "shopify webhook: missing headers"
    );
    return new Response("missing headers", { status: 400 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    logger.error("SHOPIFY_API_SECRET not set; rejecting all webhooks");
    return new Response("server misconfigured", { status: 503 });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const ok = await verifyShopifyWebhook({ rawBody, hmacHeader, secret });
  if (!ok) {
    logger.warn(
      { shopDomain, topicHeader, webhookId },
      "shopify webhook: HMAC failed"
    );
    return new Response("unauthorized", { status: 401 });
  }

  if (!isShopifyTopic(topicHeader)) {
    logger.info(
      { topicHeader, webhookId },
      "shopify webhook: unsupported topic"
    );
    return new Response("ignored", { status: 200 });
  }

  const orgId = await resolveOrgIdForShop(shopDomain);
  if (!orgId) {
    logger.info({ shopDomain }, "shopify webhook: no org for shop");
    return new Response("gone", { status: 410 });
  }

  const r2Key = `${orgId}/shopify/${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "/")}/${webhookId}.json`;

  const inserted = await database
    .insert(rawPayloads)
    .values({
      orgId,
      source: "shopify",
      eventId: webhookId,
      topic: topicHeader,
      r2Key,
    })
    .onConflictDoNothing({
      target: [rawPayloads.orgId, rawPayloads.source, rawPayloads.eventId],
    })
    .returning({ id: rawPayloads.id });

  if (inserted.length === 0) {
    logger.info(
      { orgId, webhookId },
      "shopify webhook: already processed (dedup)"
    );
    return new Response("ok", { status: 200 });
  }

  const row = inserted[0];
  if (!row) {
    return new Response("ok", { status: 200 });
  }

  try {
    await putRawPayload({
      orgId,
      source: "shopify",
      webhookId,
      body: rawBody,
    });
  } catch (e) {
    logger.error(
      { err: e, orgId, webhookId },
      "shopify webhook: R2 upload failed; row left for retry"
    );
    return new Response("ok", { status: 200 });
  }

  try {
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("ai-cfo.shopify-normalize", {
      orgId,
      rawPayloadId: row.id,
      topic: topicHeader,
    });
  } catch (e) {
    logger.warn(
      { err: e, orgId, webhookId },
      "shopify webhook: trigger.dev enqueue failed; backfill replay will catch up"
    );
  }

  return new Response("ok", { status: 200 });
};
