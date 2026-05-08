/**
 * Google Ads GAQL row → canonical NormalizedAdMetricDaily mapper.
 */

import type {
  NormalizedAdCampaign,
  NormalizedAdMetricDaily,
  ParsedGAQLRow,
} from "../canonical/types";
import { costMicrosToDecimalString } from "./cost-micros";
import { GoogleAdsGAQLResponseSchema, GoogleAdsGAQLRowSchema } from "./schemas";

export { costMicrosToDecimalString } from "./cost-micros";

const numericToInt = (v: number | string | undefined): number => {
  if (v === undefined) {
    return 0;
  }
  return Number(v);
};

const numericToString = (v: number | string | undefined): string => {
  if (v === undefined) {
    return "0.00";
  }
  // GAQL conversions_value is currency-unit decimal (not micros).
  const n = Number(v);
  const cents = Math.round(n * 100);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}${dollars}.${rem.toString().padStart(2, "0")}`;
};

const STATUS_LOOKUP: Record<string | number, string> = {
  2: "active",
  3: "paused",
  4: "removed",
  ENABLED: "active",
  PAUSED: "paused",
  REMOVED: "removed",
};

export const parseGoogleAdsRow = (raw: unknown): ParsedGAQLRow => {
  const row = GoogleAdsGAQLRowSchema.parse(raw);
  const sourceCampaignId = String(row.campaign.id);
  const currency = row.customer?.currency_code ?? "USD";

  const status = row.campaign.status
    ? (STATUS_LOOKUP[row.campaign.status] ?? String(row.campaign.status))
    : undefined;

  const campaign: NormalizedAdCampaign = {
    source: "google",
    sourceCampaignId,
    name: row.campaign.name,
    level: "campaign",
    status,
    objective: row.campaign.advertising_channel_type
      ? String(row.campaign.advertising_channel_type)
      : undefined,
    sourceMetadata: {
      customer_id: row.customer?.id,
      advertising_channel_type: row.campaign.advertising_channel_type,
    },
  };

  const metric: NormalizedAdMetricDaily = {
    source: "google",
    sourceCampaignId,
    date: row.segments.date,
    currency,
    spend: costMicrosToDecimalString(
      typeof row.metrics.cost_micros === "string"
        ? row.metrics.cost_micros
        : Math.trunc(row.metrics.cost_micros)
    ),
    impressions: numericToInt(row.metrics.impressions),
    clicks: numericToInt(row.metrics.clicks),
    conversions: row.metrics.conversions ? Number(row.metrics.conversions) : 0,
    conversionValue: numericToString(row.metrics.conversions_value),
    cpc: row.metrics.average_cpc
      ? costMicrosToDecimalString(
          typeof row.metrics.average_cpc === "string"
            ? row.metrics.average_cpc
            : Math.trunc(row.metrics.average_cpc)
        )
      : undefined,
    ctr: row.metrics.ctr ? String(row.metrics.ctr) : undefined,
    sourceMetadata: {
      customer_id: row.customer?.id,
    },
  };

  return { campaign, metric };
};

export const parseGoogleAdsResponse = (raw: unknown): ParsedGAQLRow[] => {
  const parsed = GoogleAdsGAQLResponseSchema.parse(raw);
  return parsed.results.map((row) => parseGoogleAdsRow(row));
};
