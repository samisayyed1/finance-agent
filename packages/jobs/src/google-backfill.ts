/**
 * Google Ads backfill: 90-day GAQL pull on OAuth connection.
 */

import { backfillGoogleAdsInsights } from "@ai-cfo/connector-google";
import { decryptCredential } from "@ai-cfo/connector-shopify";
import { database, dataConnections, eq, syncRuns } from "@ai-cfo/database";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { applyParsedInsight } from "./ad-spend-apply";
import { runGAQL } from "./google-runner";

const inputSchema = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

interface GoogleConnectionMeta {
  customer_ids?: string[];
  login_customer_id?: string | null;
}

interface GoogleEnv {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  encryptionKey: string;
}

const requireEnv = (): GoogleEnv => {
  const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!(encryptionKey && developerToken && clientId && clientSecret)) {
    throw new Error(
      "google-backfill: missing GOOGLE_ADS_* / DATA_CONNECTION_ENCRYPTION_KEY"
    );
  }
  return { encryptionKey, developerToken, clientId, clientSecret };
};

export const googleBackfillTask = schemaTask({
  id: "ai-cfo.google-backfill",
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
    if (conn.source !== "google") {
      throw new Error(`expected google source, got ${conn.source}`);
    }
    const env = requireEnv();
    if (!conn.encryptedCredentials) {
      throw new Error(`google connection ${connectionId} has no credentials`);
    }
    const refreshToken = await decryptCredential(
      conn.encryptedCredentials,
      env.encryptionKey
    );

    const meta = (conn.sourceMetadata ?? {}) as GoogleConnectionMeta;
    const customerIds = (meta.customer_ids ?? []).filter(
      (id): id is string => typeof id === "string"
    );
    if (customerIds.length === 0) {
      logger.warn("google-backfill: no customer ids — discovery pending", {
        orgId,
        connectionId,
      });
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
      for (const customerId of customerIds) {
        for await (const parsed of backfillGoogleAdsInsights({
          customerId,
          loginCustomerId: meta.login_customer_id ?? undefined,
          refreshToken,
          developerToken: env.developerToken,
          clientId: env.clientId,
          clientSecret: env.clientSecret,
          since,
          runner: runGAQL,
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
      logger.error("google-backfill failed", {
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
