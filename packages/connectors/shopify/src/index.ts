import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";
import {
  type NormalizedEvent,
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookTopic,
} from "./canonical/types";
import { type ParseContext, parseEvent } from "./parse";

export {
  type BackfillCallEnv,
  backfillOrders,
  type RawBackfillEvent,
} from "./backfill/iterator";
export type { NormalizedEvent } from "./canonical/types";
export {
  type NormalizedOrder,
  type NormalizedOrderLineItem,
  type NormalizedPayment,
  type NormalizedRefund,
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookTopic,
} from "./canonical/types";
export {
  authorizeUrl,
  exchangeCode,
  type OAuthConfig,
  type OAuthExchangeResult,
  SHOPIFY_OAUTH_SCOPES,
  validateShopDomain,
} from "./oauth";
export {
  decryptCredential,
  encryptCredential,
} from "./oauth/encryption";
export { buildState, verifyState } from "./oauth/state";
export { type ParseContext, parseEvent } from "./parse";
export {
  decimalStringToMinor,
  minorToDecimalString,
  sumMinor,
} from "./parse/money";
export { verifyShopifyWebhook } from "./webhook/verify";

export interface ShopifyRawEvent {
  payload: unknown;
  topic: ShopifyWebhookTopic | "backfill.order";
}

const SHOPIFY_TOPIC_SET = new Set<string>(SHOPIFY_WEBHOOK_TOPICS);

const notImplemented = (method: string): never => {
  throw new Error(
    `@ai-cfo/connector-shopify: ${method} not implemented (Day-2)`
  );
};

/**
 * The `Connector<RawEvent, Normalized>` instance is a thin orchestration shim.
 * Day-1 wires verifyWebhook + parseEvent into the universal interface so the
 * webhook ingress route in apps/api can consume the connector polymorphically.
 *
 * `oauth.authorizeUrl` / `oauth.exchangeCode` carry the same signatures as the
 * shared interface but require the OAuthConfig from the caller — the
 * apps/api route fills it from env at call time.
 */
export const shopifyConnector: Connector<ShopifyRawEvent, NormalizedEvent> = {
  source: "shopify",
  webhookTopics: SHOPIFY_WEBHOOK_TOPICS,
  oauth: {
    authorizeUrl: () =>
      notImplemented(
        "Connector.oauth.authorizeUrl — call `authorizeUrl({ orgId, shop, config })` directly with OAuthConfig"
      ),
    exchangeCode: () =>
      notImplemented(
        "Connector.oauth.exchangeCode — call `exchangeCode({ code, shop, state, config })` directly with OAuthConfig"
      ),
  },
  // biome-ignore lint/correctness/useYield: real impl is `backfillOrders` async-generator; this Connector entrypoint is unused for shopify
  // biome-ignore lint/suspicious/useAwait: see above
  async *backfill() {
    notImplemented(
      "Connector.backfill — call `backfillOrders({ shop, accessToken, since })` directly"
    );
  },
  verifyWebhook: ({ headers, rawBody }) => {
    const hmac =
      headers["x-shopify-hmac-sha256"] ?? headers["X-Shopify-Hmac-Sha256"];
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!secret) {
      throw new Error("SHOPIFY_API_SECRET not set");
    }
    // Connector.verifyWebhook is sync per the shared interface; the real
    // WebCrypto path is async, so callers must use the async
    // `verifyShopifyWebhook` export directly (which the Day-1 webhook
    // handler does). This sync stub is unreachable in practice.
    if (hmac && rawBody) {
      return false;
    }
    return false;
  },
  parseEvent: (raw) => {
    if (raw.topic === "app/uninstalled" || !SHOPIFY_TOPIC_SET.has(raw.topic)) {
      return [];
    }
    const ctx: ParseContext = {
      orgId: "",
      rawPayload: raw.payload,
      topic: raw.topic as ShopifyWebhookTopic,
    };
    // Connector.parseEvent intentionally drops orgId; the real ingress path
    // calls `parseEvent({ orgId, rawPayload, topic })` directly so org_id
    // can be threaded.
    return parseEvent(ctx);
  },
  reconcile: (): Promise<ReconciliationDelta> =>
    notImplemented("Connector.reconcile — Day-2"),
};
