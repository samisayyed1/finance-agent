/**
 * Meta backfill: 90-day Insights pull on OAuth connection. Idempotent —
 * re-running upserts the same campaign + ad_metrics_daily rows.
 */

import { backfillMetaInsights } from "@ai-cfo/connector-meta";
import { decryptCredential } from "@ai-cfo/connector-shopify";
import { database, dataConnections, eq, syncRuns } from "@ai-cfo/database";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { applyParsedInsight } from "./ad-spend-apply";

const inputSchema = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

interface MetaConnectionMeta {
  ad_account_ids?: string[];
  primary_ad_account_id?: string | null;
}

export const metaBackfillTask = schemaTask({
  id: "ai-cfo.meta-backfill",
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
    if (conn.source !== "meta") {
      throw new Error(`expected meta source, got ${conn.source}`);
    }
    const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("DATA_CONNECTION_ENCRYPTION_KEY not set");
    }
    if (!conn.encryptedCredentials) {
      throw new Error(`meta connection ${connectionId} has no credentials`);
    }
    const accessToken = await decryptCredential(
      conn.encryptedCredentials,
      encryptionKey
    );

    const meta = (conn.sourceMetadata ?? {}) as MetaConnectionMeta;
    const adAccountIds = (meta.ad_account_ids ?? []).filter(
      (id): id is string => typeof id === "string"
    );
    if (adAccountIds.length === 0) {
      logger.warn("meta-backfill: no ad accounts", { orgId, connectionId });
      return { ok: true, items: 0 };
    }

    const runRow = await database
      .insert(syncRuns)
      .values({
        orgId,
        connectionId,
        kind: "backfill",
        startedAt: new Date(),
      })
      .returning({ id: syncRuns.id });
    const runId = runRow[0]?.id;

    let items = 0;
    try {
      for (const adAccountId of adAccountIds) {
        for await (const parsed of backfillMetaInsights({
          adAccountId,
          accessToken,
          since,
        })) {
          await applyParsedInsight(orgId, parsed);
          items++;
        }
      }
      if (runId) {
        await database
          .update(syncRuns)
          .set({ finishedAt: new Date(), itemsProcessed: items })
          .where(eq(syncRuns.id, runId));
      }
      return { ok: true, items };
    } catch (err) {
      logger.error("meta-backfill failed", {
        err: err instanceof Error ? err.message : String(err),
        orgId,
      });
      if (runId) {
        await database
          .update(syncRuns)
          .set({
            finishedAt: new Date(),
            errorsJsonb: [
              {
                message: err instanceof Error ? err.message : String(err),
              },
            ],
          })
          .where(eq(syncRuns.id, runId));
      }
      throw err;
    }
  },
});
