/**
 * Meta Insights → canonical NormalizedAdMetricDaily mapper.
 *
 * Branches on which level the row is at (campaign / ad_set / ad) by which
 * id field is set. The output `sourceCampaignId` is always the deepest
 * granularity the row represents; the parent chain lives in
 * `sourceMetadata` so the normalize step can build the `parent_campaign_id`
 * relationship in `ad_campaigns`.
 */

import type {
  AdLevel,
  NormalizedAdCampaign,
  NormalizedAdMetricDaily,
  ParsedInsight,
} from "../canonical/types";
import {
  type MetaInsightAction,
  type MetaInsightRow,
  MetaInsightRowSchema,
} from "./schemas";

const PURCHASE_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "onsite_web_purchase",
  "web_in_store_purchase",
]);

const sumPurchaseActions = (
  actions: MetaInsightAction[] | undefined
): number => {
  if (!actions) {
    return 0;
  }
  let total = 0;
  for (const a of actions) {
    if (PURCHASE_ACTION_TYPES.has(a.action_type)) {
      total += Number(a.value);
    }
  }
  return total;
};

const sumPurchaseValues = (
  values: { action_type: string; value: string }[] | undefined
): string => {
  if (!values) {
    return "0";
  }
  // Use cents-as-integer math for precision, then format back to 2dp.
  let cents = 0;
  for (const v of values) {
    if (PURCHASE_ACTION_TYPES.has(v.action_type)) {
      const minor = Math.round(Number(v.value) * 100);
      cents += minor;
    }
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, "0")}`;
};

const detectLevel = (row: MetaInsightRow): AdLevel => {
  if (row.ad_id) {
    return "ad";
  }
  if (row.adset_id) {
    return "ad_set";
  }
  return "campaign";
};

const detectIds = (
  row: MetaInsightRow,
  level: AdLevel
): {
  sourceCampaignId: string;
  parentSourceCampaignId?: string;
  name: string;
} => {
  if (level === "ad") {
    return {
      sourceCampaignId: row.ad_id ?? "",
      parentSourceCampaignId: row.adset_id,
      name: row.ad_name ?? row.ad_id ?? "(unnamed ad)",
    };
  }
  if (level === "ad_set") {
    return {
      sourceCampaignId: row.adset_id ?? "",
      parentSourceCampaignId: row.campaign_id,
      name: row.adset_name ?? row.adset_id ?? "(unnamed ad set)",
    };
  }
  return {
    sourceCampaignId: row.campaign_id ?? "",
    name: row.campaign_name ?? row.campaign_id ?? "(unnamed campaign)",
  };
};

export const parseMetaInsightRow = (raw: unknown): ParsedInsight => {
  const row = MetaInsightRowSchema.parse(raw);
  const level = detectLevel(row);
  const { sourceCampaignId, parentSourceCampaignId, name } = detectIds(
    row,
    level
  );

  if (sourceCampaignId.length === 0) {
    throw new Error("meta parse: insight row missing campaign/adset/ad id");
  }

  const conversions = sumPurchaseActions(row.actions);
  const conversionValue = sumPurchaseValues(row.action_values);
  const roasSource =
    row.purchase_roas && row.purchase_roas.length > 0
      ? row.purchase_roas[0]?.value
      : undefined;

  const campaign: NormalizedAdCampaign = {
    source: "meta",
    sourceCampaignId,
    name,
    level,
    parentSourceCampaignId,
    objective: row.objective,
    sourceMetadata: {
      campaign_id: row.campaign_id,
      adset_id: row.adset_id,
      ad_id: row.ad_id,
      campaign_name: row.campaign_name,
      adset_name: row.adset_name,
    },
  };

  const metric: NormalizedAdMetricDaily = {
    source: "meta",
    sourceCampaignId,
    date: row.date_start,
    currency: row.account_currency,
    spend: row.spend,
    impressions: row.impressions ? Number(row.impressions) : 0,
    clicks: row.clicks ? Number(row.clicks) : 0,
    conversions,
    conversionValue,
    cpc: row.cpc,
    ctr: row.ctr,
    roasSource,
    sourceMetadata: {
      account_id: row.account_id,
      action_count: row.actions?.length ?? 0,
    },
  };

  return { campaign, metric };
};

export const parseMetaInsightsResponse = (raw: unknown): ParsedInsight[] => {
  if (typeof raw !== "object" || raw === null || !("data" in raw)) {
    throw new Error("meta parse: response missing data array");
  }
  const data = (raw as { data: unknown[] }).data;
  return data.map((row) => parseMetaInsightRow(row));
};
