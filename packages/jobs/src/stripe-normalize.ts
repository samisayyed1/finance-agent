import { parseStripeEvent } from "@ai-cfo/connector-stripe";
import { database, eq, rawPayloads } from "@ai-cfo/database";
import { logger, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { fetchRawPayload } from "./r2-fetch";
import { applyStripeEvents } from "./stripe-apply";

const inputSchema = z.object({
  orgId: z.string().uuid(),
  rawPayloadId: z.string().uuid(),
  eventType: z.string(),
});

export const stripeNormalizeTask = schemaTask({
  id: "ai-cfo.stripe-normalize",
  schema: inputSchema,
  run: async ({ orgId, rawPayloadId, eventType }) => {
    logger.info("stripe-normalize start", { orgId, rawPayloadId, eventType });

    const rows = await database
      .select()
      .from(rawPayloads)
      .where(eq(rawPayloads.id, rawPayloadId))
      .limit(1);
    const raw = rows[0];
    if (!raw) {
      throw new Error(`raw_payloads ${rawPayloadId} not found`);
    }

    const payload = await fetchRawPayload(raw.r2Key);
    const events = parseStripeEvent({ orgId, rawEvent: payload });
    const result = await applyStripeEvents(events, orgId);

    await database
      .update(rawPayloads)
      .set({ processedAt: new Date() })
      .where(eq(rawPayloads.id, rawPayloadId));

    logger.info("stripe-normalize done", {
      orgId,
      rawPayloadId,
      eventType,
      result,
    });

    for (const date of result.affectedDates) {
      try {
        await tasks.trigger("ai-cfo.compute-daily-metrics", { orgId, date });
      } catch (err) {
        logger.warn("compute-daily-metrics enqueue failed", {
          err,
          orgId,
          date,
        });
      }
      try {
        await tasks.trigger("ai-cfo.reconcile-day", { orgId, date });
      } catch (err) {
        logger.warn("reconcile-day enqueue failed", { err, orgId, date });
      }
    }

    return result;
  },
});
