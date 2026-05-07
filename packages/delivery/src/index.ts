/**
 * @ai-cfo/delivery — transport layer.
 *
 * Each function takes already-rendered output from @ai-cfo/reports and writes
 * the per-channel delivery_status to the `reports` table. Orthogonal to
 * rendering: rendering decides what's said; delivery decides how it travels.
 */

export {
  type SendEmailArgs,
  type SendEmailResult,
  sendEmail,
} from "./resend";
export {
  type SendSlackArgs,
  type SendSlackResult,
  sendSlack,
} from "./slack";
export {
  type SendWhatsAppArgs,
  type SendWhatsAppResult,
  sendWhatsApp,
} from "./whatsapp";

/**
 * Day-3 stub: monthly PDF (driven by `packages/reports.toMonthlyPdf`) lands
 * Day-5+ along with the office-skills PDF generator. The shape stays here
 * for callers that already wire it.
 */
export const sendMonthlyPdf = (_args: {
  to: string;
  pdfBuffer: Buffer;
  subject: string;
  traceId: string;
  orgId: string;
}): Promise<{ messageId: string }> => {
  throw new Error("@ai-cfo/delivery: sendMonthlyPdf not implemented (Day-5)");
};
