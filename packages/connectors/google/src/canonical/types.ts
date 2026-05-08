/**
 * Canonical (source-agnostic) shape Google Ads connector emits per row.
 * Same NormalizedAdMetricDaily as Meta — iron rule #10.
 */

export type AdLevel = "campaign" | "ad_set" | "ad_group" | "ad" | "keyword";

export interface NormalizedAdCampaign {
  endedAtSource?: Date;
  level: AdLevel;
  name: string;
  objective?: string;
  parentSourceCampaignId?: string;
  source: "google";
  sourceCampaignId: string;
  sourceMetadata: Record<string, unknown>;
  startedAtSource?: Date;
  status?: string;
}

export interface NormalizedAdMetricDaily {
  clicks: number;
  conversions: number;
  conversionValue: string;
  cpc?: string;
  ctr?: string;
  currency: string;
  date: string;
  impressions: number;
  roasSource?: string;
  source: "google";
  sourceCampaignId: string;
  sourceMetadata: Record<string, unknown>;
  spend: string;
}

export interface ParsedGAQLRow {
  campaign: NormalizedAdCampaign;
  metric: NormalizedAdMetricDaily;
}
