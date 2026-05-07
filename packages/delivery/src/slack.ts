import { decryptCredential } from "@ai-cfo/connector-shopify";
import { database, dataConnections, eq, reports, sql } from "@ai-cfo/database";
import type { KnownBlock } from "@slack/types";
import { WebClient } from "@slack/web-api";

export interface SendSlackArgs {
  blocks: KnownBlock[];
  /**
   * Optional override; if absent we resolve the org's installed Slack token
   * from `data_connections` (source = 'slack'). The system token from env
   * (`SLACK_BOT_TOKEN`) is a Day-3 fallback for local dev.
   */
  botToken?: string;
  channel: string;
  orgId: string;
  traceId: string;
}

export interface SendSlackResult {
  channel: string;
  ok: true;
  ts: string;
}

const updateReportDeliveryStatus = async (args: {
  traceId: string;
  payload: Record<string, unknown>;
}): Promise<void> => {
  await database
    .update(reports)
    .set({
      deliveryStatus: sql`jsonb_set(coalesce(${reports.deliveryStatus}, '{}'::jsonb), '{slack}', ${JSON.stringify(args.payload)}::jsonb, true)`,
    })
    .where(eq(reports.aiTraceId, args.traceId));
};

const resolveBotToken = async (orgId: string): Promise<string | null> => {
  const conns = await database
    .select()
    .from(dataConnections)
    .where(eq(dataConnections.orgId, orgId));
  const slack = conns.find((c) => c.source === "slack");
  if (!slack?.encryptedCredentials) {
    return null;
  }
  const key = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  if (!key) {
    return null;
  }
  return await decryptCredential(slack.encryptedCredentials, key);
};

export const sendSlack = async (
  args: SendSlackArgs
): Promise<SendSlackResult> => {
  const token =
    args.botToken ??
    (await resolveBotToken(args.orgId)) ??
    process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "no Slack bot token available (org has no Slack connection and SLACK_BOT_TOKEN not set)"
    );
  }
  const client = new WebClient(token);
  const result = await client.chat.postMessage({
    channel: args.channel,
    blocks: args.blocks,
    text: "Daily report",
    metadata: {
      event_type: "ai_cfo_daily_report",
      event_payload: { trace_id: args.traceId },
    },
  });
  if (!result.ok) {
    throw new Error(`slack postMessage failed: ${result.error ?? "unknown"}`);
  }
  const ts = String(result.ts ?? "");
  const channel = String(result.channel ?? args.channel);
  await updateReportDeliveryStatus({
    traceId: args.traceId,
    payload: {
      sent_at: new Date().toISOString(),
      status: "sent",
      ts,
      channel,
    },
  });
  return { ok: true, ts, channel };
};
