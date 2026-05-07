import {
  parseEvent,
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookTopic,
} from "@ai-cfo/connector-shopify";
import { database, eq, rawPayloads } from "@ai-cfo/database";
import { logger, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { fetchRawPayload } from "./r2-fetch";
import { applyNormalizedEvents } from "./shopify-apply";

const TOPIC_VALUES = [...SHOPIFY_WEBHOOK_TOPICS, "backfill.order"] as const;

const inputSchema = z.object({
  orgId: z.string().uuid(),
  rawPayloadId: z.string().uuid(),
  topic: z.enum(TOPIC_VALUES),
});

export const shopifyNormalizeTask = schemaTask({
  id: "ai-cfo.shopify-normalize",
  schema: inputSchema,
  run: async (payload) => {
    const { orgId, rawPayloadId, topic } = payload;
    logger.info("shopify-normalize start", { orgId, rawPayloadId, topic });

    const rows = await database
      .select()
      .from(rawPayloads)
      .where(eq(rawPayloads.id, rawPayloadId))
      .limit(1);
    const raw = rows[0];
    if (!raw) {
      throw new Error(`raw_payloads ${rawPayloadId} not found`);
    }

    const payloadJson = await fetchRawPayload(raw.r2Key);

    const events = parseEvent({
      orgId,
      rawPayload: payloadJson,
      topic: topic as ShopifyWebhookTopic | "backfill.order",
    });

    const result = await applyNormalizedEvents(events);

    await database
      .update(rawPayloads)
      .set({ processedAt: new Date() })
      .where(eq(rawPayloads.id, rawPayloadId));

    logger.info("shopify-normalize done", {
      orgId,
      rawPayloadId,
      ordersUpserted: result.ordersUpserted,
      paymentsUpserted: result.paymentsUpserted,
      refundsUpserted: result.refundsUpserted,
      affectedDates: result.affectedDates,
    });

    for (const date of result.affectedDates) {
      try {
        await tasks.trigger("ai-cfo.compute-daily-metrics", {
          orgId,
          date,
          source: "shopify" as const,
        });
      } catch (err) {
        logger.warn("compute-daily-metrics enqueue failed", {
          err,
          orgId,
          date,
        });
      }
    }

    return result;
  },
});
