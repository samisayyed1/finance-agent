/**
 * Canonical (source-agnostic) shape an ad-platform connector emits per
 * insight row. Mirrors the public.ad_metrics_daily Drizzle schema. Every
 * connector — Meta, Google, TikTok — produces the same NormalizedAdMetric
 * shape (iron rule #10).
 */

export type AdLevel = "campaign" | "ad_set" | "ad_group" | "ad" | "keyword";

export interface NormalizedAdCampaign {
  endedAtSource?: Date;
  level: AdLevel;
  name: string;
  objective?: string;
  /** Source-side parent id; the normalize step resolves this to a UUID. */
  parentSourceCampaignId?: string;
  source: "meta" | "google";
  sourceCampaignId: string;
  sourceMetadata: Record<string, unknown>;
  startedAtSource?: Date;
  status?: string;
}

export interface NormalizedAdMetricDaily {
  /** ISO YYYY-MM-DD (org-local interpretation upstream). */
  clicks: number;
  /** Conversions reported by the source — fractional allowed (Meta attribution). */
  conversions: number;
  /** Conversion value as a decimal string (currency unit, e.g. "1234.56"). */
  conversionValue: string;
  cpc?: string;
  ctr?: string;
  currency: string;
  date: string;
  impressions: number;
  /** ROAS as the source reports it (we still compute our own true ROAS). */
  roasSource?: string;
  source: "meta" | "google";
  sourceCampaignId: string;
  sourceMetadata: Record<string, unknown>;
  /** Spend as a decimal string (currency unit, e.g. "1234.56"). */
  spend: string;
}

export interface ParsedInsight {
  campaign: NormalizedAdCampaign;
  metric: NormalizedAdMetricDaily;
}
