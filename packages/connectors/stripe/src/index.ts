import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";

export interface StripeRawEvent {
  data: { object: Record<string, unknown> };
  type: string;
}

export interface StripeNormalized {
  amountMinor: number;
  currency: string;
  data: Record<string, unknown>;
  kind: "charge" | "refund" | "payout" | "fee" | "dispute";
  occurredAt: Date;
  stripeId: string;
}

const notImplemented = (method: string): never => {
  throw new Error(
    `@ai-cfo/connector-stripe: ${method} not implemented (Day-0)`
  );
};

export const stripeConnector: Connector<StripeRawEvent, StripeNormalized> = {
  source: "stripe",
  webhookTopics: [
    "charge.succeeded",
    "charge.refunded",
    "charge.dispute.created",
    "payout.paid",
    "balance.available",
  ],
  oauth: {
    authorizeUrl: () => notImplemented("oauth.authorizeUrl"),
    exchangeCode: () => notImplemented("oauth.exchangeCode"),
  },
  // biome-ignore lint/correctness/useYield: Day-0 stub
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  async *backfill() {
    notImplemented("backfill");
  },
  verifyWebhook: () => notImplemented("verifyWebhook"),
  parseEvent: () => notImplemented("parseEvent"),
  reconcile: (): Promise<ReconciliationDelta> => notImplemented("reconcile"),
};
