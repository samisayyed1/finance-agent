import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";
import {
  type NormalizedStripeEvent,
  STRIPE_WEBHOOK_TOPICS,
  type StripeWebhookTopic,
} from "./canonical/types";
import { parseStripeEvent } from "./parse";
import { stripeEventSchema } from "./parse/schemas";
import { verifyStripeWebhook } from "./webhook/verify";

export {
  type BackfillCallEnv,
  backfillCharges,
  backfillPayouts,
  type RawBackfillEvent,
} from "./backfill/iterator";
export type {
  NormalizedStripeEvent,
  NormalizedStripePayment,
  NormalizedStripePayout,
  NormalizedStripeRefund,
  StripeWebhookTopic,
} from "./canonical/types";
export { STRIPE_WEBHOOK_TOPICS } from "./canonical/types";
export {
  authorizeUrl,
  exchangeCode,
  type StripeOAuthConfig,
  type StripeOAuthExchangeResult,
} from "./oauth";
export { type ParseContext, parseStripeEvent } from "./parse";
export {
  type StripeCharge,
  type StripeDispute,
  type StripeEvent,
  type StripePayout,
  type StripeRefund,
  stripeChargeSchema,
  stripeDisputeSchema,
  stripeEventSchema,
  stripePayoutSchema,
  stripeRefundSchema,
} from "./parse/schemas";
export { verifyStripeWebhook } from "./webhook/verify";

export interface StripeRawEvent {
  payload: unknown;
  topic: StripeWebhookTopic | "backfill.charge" | "backfill.payout";
}

const notImplemented = (m: string): never => {
  throw new Error(`@ai-cfo/connector-stripe: ${m} not implemented (Day-3)`);
};

export const stripeConnector: Connector<StripeRawEvent, NormalizedStripeEvent> =
  {
    source: "stripe",
    webhookTopics: STRIPE_WEBHOOK_TOPICS,
    oauth: {
      authorizeUrl: () =>
        notImplemented(
          "Connector.oauth.authorizeUrl — call `authorizeUrl({ orgId, config })` directly with StripeOAuthConfig"
        ),
      exchangeCode: () =>
        notImplemented(
          "Connector.oauth.exchangeCode — call `exchangeCode({ code, state, config })` directly with StripeOAuthConfig"
        ),
    },
    // biome-ignore lint/correctness/useYield: real impl is `backfillCharges`/`backfillPayouts`; this Connector entrypoint is unused for Stripe
    // biome-ignore lint/suspicious/useAwait: see above
    async *backfill() {
      notImplemented(
        "Connector.backfill — call `backfillCharges`/`backfillPayouts` directly"
      );
    },
    verifyWebhook: async ({ headers, rawBody }) => {
      const sig = headers["stripe-signature"] ?? headers["Stripe-Signature"];
      const apiKey = process.env.STRIPE_SECRET_KEY;
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!(apiKey && endpointSecret)) {
        throw new Error(
          "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set"
        );
      }
      if (!sig) {
        return false;
      }
      try {
        await verifyStripeWebhook({
          rawBody,
          signatureHeader: sig,
          endpointSecret,
          apiKey,
        });
        return true;
      } catch {
        return false;
      }
    },
    parseEvent: (raw) => {
      if (raw.topic === "backfill.charge" || raw.topic === "backfill.payout") {
        // For backfill we synthesize the Stripe.Event wrapper before parsing.
        const synthetic = {
          id: `backfill_${Date.now()}`,
          object: "event",
          type:
            raw.topic === "backfill.charge"
              ? "charge.succeeded"
              : "payout.paid",
          livemode: false,
          created: Math.floor(Date.now() / 1000),
          data: { object: raw.payload },
        };
        const validated = stripeEventSchema.parse(synthetic);
        return parseStripeEvent({ orgId: "", rawEvent: validated });
      }
      return parseStripeEvent({ orgId: "", rawEvent: raw.payload });
    },
    reconcile: (): Promise<ReconciliationDelta> =>
      notImplemented("Connector.reconcile — Day-3"),
  };
