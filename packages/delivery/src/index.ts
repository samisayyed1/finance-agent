/**
 * @ai-cfo/delivery — transport layer.
 *
 * Each function takes already-rendered output from @ai-cfo/reports and writes
 * the per-channel delivery_status to the `reports` table. Orthogonal to
 * rendering: rendering decides what's said; delivery decides how it travels.
 */

import type { KnownBlock } from "@slack/types";

interface BaseDelivery {
  traceId: string;
}

const notImplemented = (method: string): never => {
  throw new Error(`@ai-cfo/delivery: ${method} not implemented (Day-0)`);
};

export const sendEmail = (
  _args: BaseDelivery & {
    to: string;
    subject: string;
    html: string;
  }
): Promise<{ messageId: string }> => notImplemented("sendEmail");

export const sendSlack = (
  _args: BaseDelivery & {
    channel: string;
    blocks: KnownBlock[];
  }
): Promise<{ ts: string }> => notImplemented("sendSlack");

export const sendWhatsApp = (
  _args: BaseDelivery & {
    to: string;
    body: string;
  }
): Promise<{ sid: string }> => notImplemented("sendWhatsApp");

export const sendMonthlyPdf = (
  _args: BaseDelivery & {
    to: string;
    pdfBuffer: Buffer;
    subject: string;
  }
): Promise<{ messageId: string }> => notImplemented("sendMonthlyPdf");
