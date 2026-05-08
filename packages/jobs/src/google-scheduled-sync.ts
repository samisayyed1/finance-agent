/**
 * Google Ads scheduled daily sync — last 7 days for every active Google
 * connection. Schedule: 02:15 UTC daily (staggered from Meta's 02:00).
 */

import { backfillGoogleAdsInsights } from "@ai-cfo/connector-google";
import { decryptCredential } from "@ai-cfo/connector-shopify";
import { and, database, dataConnections, eq } from "@ai-cfo/database";
import { logger, schedules } from "@trigger.dev/sdk";
import { applyParsedInsight } from "./ad-spend-apply";
import { runGAQL } from "./google-runner";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface GoogleConnectionMeta {
  customer_ids?: string[];
  login_customer_id?: string | null;
}

export const googleScheduledSyncJob = schedules.task({
  id: "ai-cfo.google-scheduled-sync",
  cron: "15 2 * * *",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const since = new Date(now.getTime() - SEVEN_DAYS_MS)
      .toISOString()
      .slice(0, 10);
    const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    if (!(encryptionKey && developerToken && clientId && clientSecret)) {
      logger.error(
        "google-scheduled-sync: missing required env (GOOGLE_ADS_* / DATA_CONNECTION_ENCRYPTION_KEY)"
      );
      return { ok: false, reason: "no_env" };
    }

    const conns = await database
      .select()
      .from(dataConnections)
      .where(
        and(
          eq(dataConnections.source, "google"),
          eq(dataConnections.status, "active")
        )
      );

    let items = 0;
    for (const conn of conns) {
      if (!conn.encryptedCredentials) {
        continue;
      }
      try {
        const refreshToken = await decryptCredential(
          conn.encryptedCredentials,
          encryptionKey
        );
        const meta = (conn.sourceMetadata ?? {}) as GoogleConnectionMeta;
        const customerIds = (meta.customer_ids ?? []).filter(
          (id): id is string => typeof id === "string"
        );
        for (const customerId of customerIds) {
          for await (const parsed of backfillGoogleAdsInsights({
            customerId,
            loginCustomerId: meta.login_customer_id ?? undefined,
            refreshToken,
            developerToken,
            clientId,
            clientSecret,
            since,
            runner: runGAQL,
          })) {
            await applyParsedInsight(conn.orgId, parsed);
            items++;
          }
        }
      } catch (err) {
        logger.error("google-scheduled-sync: per-org failure", {
          err: err instanceof Error ? err.message : String(err),
          orgId: conn.orgId,
        });
      }
    }
    logger.info("google-scheduled-sync done", { items, orgs: conns.length });
    return { ok: true, items, orgs: conns.length };
  },
});
