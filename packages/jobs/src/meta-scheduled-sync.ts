/**
 * Meta scheduled daily sync — pulls the last 7 days for every active Meta
 * connection. Catches Meta's attribution lag (sales attributed up to 7d
 * post-click) and any late-arriving conversion data.
 *
 * Schedule: 02:00 UTC daily.
 */

import { backfillMetaInsights } from "@ai-cfo/connector-meta";
import { decryptCredential } from "@ai-cfo/connector-shopify";
import { and, database, dataConnections, eq } from "@ai-cfo/database";
import { logger, schedules } from "@trigger.dev/sdk";
import { applyParsedInsight } from "./ad-spend-apply";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface MetaConnectionMeta {
  ad_account_ids?: string[];
}

export const metaScheduledSyncJob = schedules.task({
  id: "ai-cfo.meta-scheduled-sync",
  cron: "0 2 * * *",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const since = new Date(now.getTime() - SEVEN_DAYS_MS)
      .toISOString()
      .slice(0, 10);
    const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
    if (!encryptionKey) {
      logger.error(
        "meta-scheduled-sync: DATA_CONNECTION_ENCRYPTION_KEY not set"
      );
      return { ok: false, reason: "no_encryption_key" };
    }

    const conns = await database
      .select()
      .from(dataConnections)
      .where(
        and(
          eq(dataConnections.source, "meta"),
          eq(dataConnections.status, "active")
        )
      );

    let items = 0;
    for (const conn of conns) {
      if (!conn.encryptedCredentials) {
        continue;
      }
      try {
        const accessToken = await decryptCredential(
          conn.encryptedCredentials,
          encryptionKey
        );
        const meta = (conn.sourceMetadata ?? {}) as MetaConnectionMeta;
        const adAccountIds = (meta.ad_account_ids ?? []).filter(
          (id): id is string => typeof id === "string"
        );
        for (const adAccountId of adAccountIds) {
          for await (const parsed of backfillMetaInsights({
            adAccountId,
            accessToken,
            since,
          })) {
            await applyParsedInsight(conn.orgId, parsed);
            items++;
          }
        }
      } catch (err) {
        logger.error("meta-scheduled-sync: per-org failure", {
          err: err instanceof Error ? err.message : String(err),
          orgId: conn.orgId,
        });
      }
    }
    logger.info("meta-scheduled-sync done", { items, orgs: conns.length });
    return { ok: true, items, orgs: conns.length };
  },
});
