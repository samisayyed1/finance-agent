/**
 * @ai-cfo/connector-google — Day-5 Google Ads connector.
 */

import type { Connector, ReconciliationDelta } from "@ai-cfo/shared";
import type { ParsedGAQLRow } from "./canonical/types";
import { parseGoogleAdsRow } from "./parse";

export {
  backfillGoogleAdsInsights,
  buildBackfillGAQL,
  type GoogleAdsBackfillArgs,
} from "./backfill";
export type {
  AdLevel,
  NormalizedAdCampaign,
  NormalizedAdMetricDaily,
  ParsedGAQLRow,
} from "./canonical/types";
export {
  buildGoogleAdsAuthorizeUrl,
  exchangeGoogleAdsCode,
  GOOGLE_ADS_SCOPE,
  type GoogleAdsOAuthConfig,
  type GoogleAdsTokenExchangeResult,
} from "./oauth";
export {
  costMicrosToDecimalString,
  parseGoogleAdsResponse,
  parseGoogleAdsRow,
} from "./parse";
export {
  GoogleAdsGAQLResponseSchema,
  GoogleAdsGAQLRowSchema,
} from "./parse/schemas";

const notImplemented = (method: string): never => {
  throw new Error(`@ai-cfo/connector-google: ${method} not implemented`);
};

export const googleAdsConnector: Connector<unknown, ParsedGAQLRow> = {
  source: "google",
  webhookTopics: [],
  oauth: {
    authorizeUrl: () =>
      notImplemented(
        "oauth.authorizeUrl on adapter — use buildGoogleAdsAuthorizeUrl(config, orgId)"
      ),
    exchangeCode: () =>
      notImplemented(
        "oauth.exchangeCode on adapter — use exchangeGoogleAdsCode({ code, state, config })"
      ),
  },
  // biome-ignore lint/correctness/useYield: adapter delegates to backfillGoogleAdsInsights
  // biome-ignore lint/suspicious/useAwait: ditto
  async *backfill() {
    throw new Error(
      "googleAdsConnector.backfill: use backfillGoogleAdsInsights(args) directly"
    );
  },
  verifyWebhook: () => Promise.resolve(false),
  parseEvent: (raw: unknown): ParsedGAQLRow[] => [parseGoogleAdsRow(raw)],
  reconcile: (): Promise<ReconciliationDelta> =>
    notImplemented("reconcile (Day-6: ad-attribution mismatch detection)"),
};

// Backwards-compat alias for any Day-3/4 callers using `googleConnector`.
export const googleConnector = googleAdsConnector;
