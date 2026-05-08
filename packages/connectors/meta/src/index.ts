/**
 * @ai-cfo/connector-meta — Day-5 real implementation.
 *
 * The connector adapter (`metaConnector`) preserves the universal
 * Connector<RawEvent, Normalized> shape. Helper exports
 * (buildMetaAuthorizeUrl, exchangeMetaCode, listMetaAdAccounts,
 * backfillMetaInsights, parseMetaInsightRow) are what the OAuth route
 * + Trigger.dev jobs use directly.
 */

import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";
import type { ParsedInsight } from "./canonical/types";
import { parseMetaInsightRow } from "./parse";

export { backfillMetaInsights, type MetaBackfillArgs } from "./backfill";
export type {
  AdLevel,
  NormalizedAdCampaign,
  NormalizedAdMetricDaily,
  ParsedInsight,
} from "./canonical/types";
export {
  buildMetaAuthorizeUrl,
  exchangeMetaCode,
  listMetaAdAccounts,
  META_API_VERSION,
  type MetaAdAccount,
  type MetaOAuthConfig,
  REQUIRED_SCOPES,
} from "./oauth";
export {
  parseMetaInsightRow,
  parseMetaInsightsResponse,
} from "./parse";
export {
  MetaInsightRowSchema,
  MetaInsightsResponseSchema,
} from "./parse/schemas";

const notImplemented = (method: string): never => {
  throw new Error(`@ai-cfo/connector-meta: ${method} not implemented`);
};

export const metaConnector: Connector<unknown, ParsedInsight> = {
  source: "meta",
  webhookTopics: [],
  oauth: {
    authorizeUrl: () =>
      notImplemented(
        "oauth.authorizeUrl on adapter — use buildMetaAuthorizeUrl(config, orgId)"
      ),
    exchangeCode: () =>
      notImplemented(
        "oauth.exchangeCode on adapter — use exchangeMetaCode({ code, state, config })"
      ),
  },
  // biome-ignore lint/correctness/useYield: adapter delegates to backfillMetaInsights with explicit args
  // biome-ignore lint/suspicious/useAwait: ditto
  async *backfill() {
    throw new Error(
      "metaConnector.backfill: use backfillMetaInsights({adAccountId, accessToken, since}) directly"
    );
  },
  verifyWebhook: () => Promise.resolve(false),
  parseEvent: (raw: unknown): ParsedInsight[] => [parseMetaInsightRow(raw)],
  reconcile: (): Promise<ReconciliationDelta> =>
    notImplemented("reconcile (Day-6: ad-attribution mismatch detection)"),
};
