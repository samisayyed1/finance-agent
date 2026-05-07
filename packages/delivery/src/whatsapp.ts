export interface SendWhatsAppArgs {
  body: string;
  orgId: string;
  to: string;
  traceId: string;
}

export interface SendWhatsAppResult {
  ok: true;
  sentAt: string;
  sid: string;
}

/**
 * Day-3 stub. Real Twilio implementation lands Day-5+ when WhatsApp delivery
 * becomes a priority. The shape matches `sendEmail` / `sendSlack` so the
 * orchestrator can route uniformly.
 */
export const sendWhatsApp = (
  _args: SendWhatsAppArgs
): Promise<SendWhatsAppResult> => {
  return Promise.reject(
    new Error("@ai-cfo/delivery: sendWhatsApp not implemented (Day-5)")
  );
};
