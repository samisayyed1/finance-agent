import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";

export interface GoogleRawEvent {
  campaignId: string;
  clicks: number;
  conversions: number;
  costMicros: number;
  date: string;
  impressions: number;
}

export interface GoogleNormalized {
  campaignId: string;
  clicks: number;
  conversions: number;
  impressions: number;
  kind: "ad_spend" | "ad_perf";
  occurredAt: Date;
  spendMinor: number;
}

const notImplemented = (method: string): never => {
  throw new Error(
    `@ai-cfo/connector-google: ${method} not implemented (Day-0)`
  );
};

export const googleConnector: Connector<GoogleRawEvent, GoogleNormalized> = {
  source: "google",
  webhookTopics: [],
  oauth: {
    authorizeUrl: () => notImplemented("oauth.authorizeUrl"),
    exchangeCode: () => notImplemented("oauth.exchangeCode"),
  },
  // biome-ignore lint/correctness/useYield: Day-0 stub
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  async *backfill() {
    notImplemented("backfill");
  },
  verifyWebhook: () => Promise.resolve(true),
  parseEvent: () => notImplemented("parseEvent"),
  reconcile: (): Promise<ReconciliationDelta> => notImplemented("reconcile"),
};
