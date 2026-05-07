import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";

export interface ShopifyRawEvent {
  payload: Record<string, unknown>;
  topic: string;
}

export interface ShopifyNormalized {
  data: Record<string, unknown>;
  kind: "order" | "refund" | "product" | "customer";
  occurredAt: Date;
  shopifyId: string;
}

const notImplemented = (method: string): never => {
  throw new Error(
    `@ai-cfo/connector-shopify: ${method} not implemented (Day-0)`
  );
};

export const shopifyConnector: Connector<ShopifyRawEvent, ShopifyNormalized> = {
  source: "shopify",
  webhookTopics: [
    "orders/create",
    "orders/updated",
    "orders/cancelled",
    "refunds/create",
    "products/create",
    "products/update",
  ],
  oauth: {
    authorizeUrl: (_orgId, _state) => notImplemented("oauth.authorizeUrl"),
    exchangeCode: () => notImplemented("oauth.exchangeCode"),
  },
  // biome-ignore lint/correctness/useYield: Day-0 stub
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  async *backfill(_orgId, _since) {
    notImplemented("backfill");
  },
  verifyWebhook: () => notImplemented("verifyWebhook"),
  parseEvent: () => notImplemented("parseEvent"),
  reconcile: (): Promise<ReconciliationDelta> => notImplemented("reconcile"),
};
