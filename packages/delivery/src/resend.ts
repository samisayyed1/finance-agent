import { database, eq, reports, sql } from "@ai-cfo/database";
import { Resend } from "resend";

export interface SendEmailArgs {
  /** Optional override; defaults to RESEND_FROM env. */
  from?: string;
  html: string;
  orgId: string;
  /** Optional reply-to (e.g. operator's account email for inline replies). */
  replyTo?: string;
  subject: string;
  to: string | string[];
  traceId: string;
}

export interface SendEmailResult {
  messageId: string;
  ok: true;
  sentAt: string;
}

let cachedClient: Resend | null = null;

const getClient = (): Resend => {
  if (cachedClient) {
    return cachedClient;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY not set — email delivery is gated on this env var"
    );
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
};

const updateReportDeliveryStatus = async (args: {
  orgId: string;
  traceId: string;
  channel: "email" | "slack" | "whatsapp";
  payload: Record<string, unknown>;
}): Promise<void> => {
  // Update the matching `reports` row's delivery_status JSONB. The traceId
  // column is `ai_trace_id`. We update at most one row.
  await database
    .update(reports)
    .set({
      deliveryStatus: sql`jsonb_set(coalesce(${reports.deliveryStatus}, '{}'::jsonb), ${`{${args.channel}}`}, ${JSON.stringify(args.payload)}::jsonb, true)`,
    })
    .where(eq(reports.aiTraceId, args.traceId));
};

export const sendEmail = async (
  args: SendEmailArgs
): Promise<SendEmailResult> => {
  const from = args.from ?? process.env.RESEND_FROM;
  if (!from) {
    throw new Error("RESEND_FROM (or `from` arg) required");
  }
  const client = getClient();
  const result = await client.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    replyTo: args.replyTo,
    headers: { "X-AI-CFO-Trace-Id": args.traceId },
  });
  if (result.error) {
    throw new Error(
      `resend send failed: ${result.error.name} ${result.error.message}`
    );
  }
  const messageId = result.data?.id ?? "unknown";
  const sentAt = new Date().toISOString();
  await updateReportDeliveryStatus({
    orgId: args.orgId,
    traceId: args.traceId,
    channel: "email",
    payload: { sent_at: sentAt, status: "sent", message_id: messageId },
  });
  return { ok: true, messageId, sentAt };
};
