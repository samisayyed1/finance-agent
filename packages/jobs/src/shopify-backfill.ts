import { backfillOrders, decryptCredential } from "@ai-cfo/connector-shopify";
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

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const inputSchema = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
  /** ISO date string. Defaults to ninetyDaysAgo if omitted. */
  since: z.string().datetime().optional(),
});

interface ShopifyConnectionMeta {
  shop_domain?: string;
}

const sinceCutoff = (override?: string): Date =>
  override ? new Date(override) : new Date(Date.now() - NINETY_DAYS_MS);

export const shopifyBackfillTask = schemaTask({
  id: "ai-cfo.shopify-backfill",
  schema: inputSchema,
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
    const meta = (conn.sourceMetadata ?? {}) as ShopifyConnectionMeta;
    const shop = meta.shop_domain;
    if (!shop) {
      throw new Error(
        `data_connections ${connectionId} has no source_metadata.shop_domain`
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
      .values({
        connectionId,
        orgId,
        kind: "backfill",
      })
      .returning({ id: syncRuns.id });
    const runRow = runs[0];
    if (!runRow) {
      throw new Error("failed to create sync_runs row");
    }

    let processed = 0;
    const errors: Array<{ at: string; error: string }> = [];
    const startedAt = Date.now();

    try {
      for await (const event of backfillOrders({
        shop,
        accessToken,
        since: sinceCutoff(since),
      })) {
        try {
          const orderId = (event.payload as { id?: string | number }).id;
          const eventId = `backfill:${String(orderId)}`;
          const r2Key = await putRawJson({
            orgId,
            source: "shopify",
            webhookId: eventId,
            payload: event.payload,
          });
          const inserted = await database
            .insert(rawPayloads)
            .values({
              orgId,
              source: "shopify",
              eventId,
              topic: event.topic,
              r2Key,
            })
            .onConflictDoNothing({
              target: [
                rawPayloads.orgId,
                rawPayloads.source,
                rawPayloads.eventId,
              ],
            })
            .returning({ id: rawPayloads.id });
          const newRow = inserted[0];
          if (newRow) {
            await tasks.trigger("ai-cfo.shopify-normalize", {
              orgId,
              rawPayloadId: newRow.id,
              topic: event.topic,
            });
          }
          processed += 1;
          if (processed % 50 === 0) {
            await database
              .update(syncRuns)
              .set({ itemsProcessed: processed })
              .where(eq(syncRuns.id, runRow.id));
          }
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

    logger.info("shopify-backfill done", {
      orgId,
      connectionId,
      processed,
      errors: errors.length,
      durationMs: Date.now() - startedAt,
    });

    return { processed, errors: errors.length };
  },
});
