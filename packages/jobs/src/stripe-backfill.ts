import { decryptCredential } from "@ai-cfo/connector-shopify";
import {
  backfillCharges,
  backfillPayouts,
  parseStripeEvent,
  stripeEventSchema,
} from "@ai-cfo/connector-stripe";
import {
  database,
  dataConnections,
  eq,
  rawPayloads,
  syncRuns,
} from "@ai-cfo/database";
import { logger, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { putRawJson } from "./r2-put";
import { applyStripeEvents } from "./stripe-apply";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const inputSchema = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
  since: z.string().datetime().optional(),
});

interface StripeConnectionMeta {
  stripe_account_id?: string;
}

const sinceCutoff = (override?: string): Date =>
  override ? new Date(override) : new Date(Date.now() - NINETY_DAYS_MS);

const wrapAsEvent = (
  type: "charge.succeeded" | "payout.paid",
  payload: unknown
): unknown => ({
  id: `backfill_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  object: "event",
  type,
  livemode: false,
  created: Math.floor(Date.now() / 1000),
  data: { object: payload },
});

export const stripeBackfillTask = schemaTask({
  id: "ai-cfo.stripe-backfill",
  schema: inputSchema,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration of decrypt + paginated fetch + per-event upsert + R2 + sync_runs is intentionally end-to-end; the inner steps are factored out (handleEvent) and the apply path is in stripe-apply.ts
  run: async ({ orgId, connectionId, since }) => {
    const conns = await database
      .select()
      .from(dataConnections)
      .where(eq(dataConnections.id, connectionId))
      .limit(1);
    const conn = conns[0];
    if (!conn) {
      throw new Error(`data_connections ${connectionId} not found`);
    }
    if (conn.orgId !== orgId) {
      throw new Error(
        `data_connections ${connectionId} belongs to a different org`
      );
    }
    if (!conn.encryptedCredentials) {
      throw new Error(`data_connections ${connectionId} has no credentials`);
    }
    const meta = (conn.sourceMetadata ?? {}) as StripeConnectionMeta;
    const stripeAccountId = meta.stripe_account_id;
    if (!stripeAccountId) {
      throw new Error(
        `data_connections ${connectionId} has no source_metadata.stripe_account_id`
      );
    }
    const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("DATA_CONNECTION_ENCRYPTION_KEY not set");
    }
    const accessToken = await decryptCredential(
      conn.encryptedCredentials,
      encryptionKey
    );

    const runs = await database
      .insert(syncRuns)
      .values({ connectionId, orgId, kind: "backfill" })
      .returning({ id: syncRuns.id });
    const runRow = runs[0];
    if (!runRow) {
      throw new Error("failed to create sync_runs row");
    }

    let processed = 0;
    const errors: Array<{ at: string; error: string }> = [];
    const startedAt = Date.now();

    const handleEvent = async (
      topic: "charge.succeeded" | "payout.paid",
      payload: unknown,
      eventId: string
    ): Promise<void> => {
      const validated = stripeEventSchema.parse(wrapAsEvent(topic, payload));
      const events = parseStripeEvent({ orgId, rawEvent: validated });
      await applyStripeEvents(events, orgId);
      const r2Key = await putRawJson({
        orgId,
        source: "stripe",
        webhookId: eventId,
        payload: validated,
      });
      await database
        .insert(rawPayloads)
        .values({
          orgId,
          source: "stripe",
          eventId,
          topic,
          r2Key,
          processedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [rawPayloads.orgId, rawPayloads.source, rawPayloads.eventId],
        });
    };

    try {
      for await (const ev of backfillCharges({
        apiKey: accessToken,
        stripeAccountId,
        since: sinceCutoff(since),
      })) {
        try {
          const id = `backfill:charge:${(ev.payload as { id: string }).id}`;
          await handleEvent(ev.topic, ev.payload, id);
          processed += 1;
        } catch (err) {
          errors.push({
            at: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      for await (const ev of backfillPayouts({
        apiKey: accessToken,
        stripeAccountId,
        since: sinceCutoff(since),
      })) {
        try {
          const id = `backfill:payout:${(ev.payload as { id: string }).id}`;
          await handleEvent(ev.topic, ev.payload, id);
          processed += 1;
        } catch (err) {
          errors.push({
            at: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      await database
        .update(syncRuns)
        .set({
          itemsProcessed: processed,
          finishedAt: new Date(),
          errorsJsonb: errors,
        })
        .where(eq(syncRuns.id, runRow.id));
      await database
        .update(dataConnections)
        .set({ lastSyncedAt: new Date() })
        .where(eq(dataConnections.id, connectionId));
    }

    // Trigger compute + reconcile for last 90 days (idempotent).
    try {
      await tasks.trigger("ai-cfo.reconcile-window", {
        orgId,
        from: sinceCutoff(since).toISOString(),
        to: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn("reconcile-window enqueue failed", { err, orgId });
    }

    logger.info("stripe-backfill done", {
      orgId,
      connectionId,
      processed,
      errors: errors.length,
      durationMs: Date.now() - startedAt,
    });

    return { processed, errors: errors.length };
  },
});
