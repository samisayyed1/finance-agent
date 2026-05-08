/**
 * Source-agnostic apply step for parsed ad-platform insights.
 *
 * Both Meta and Google connectors emit the same canonical ParsedInsight
 * shape ({campaign: NormalizedAdCampaign, metric: NormalizedAdMetricDaily}).
 * This module upserts the campaign hierarchy + the daily metric row,
 * resolving parent_campaign_id when present.
 */

import {
  adCampaigns,
  adMetricsDaily,
  and,
  database,
  eq,
} from "@ai-cfo/database";

interface NormalizedAdCampaign {
  endedAtSource?: Date;
  level: string;
  name: string;
  objective?: string;
  parentSourceCampaignId?: string;
  source: "meta" | "google";
  sourceCampaignId: string;
  sourceMetadata: Record<string, unknown>;
  startedAtSource?: Date;
  status?: string;
}

interface NormalizedAdMetricDaily {
  clicks: number;
  conversions: number;
  conversionValue: string;
  cpc?: string;
  ctr?: string;
  currency: string;
  date: string;
  impressions: number;
  roasSource?: string;
  source: "meta" | "google";
  sourceCampaignId: string;
  sourceMetadata: Record<string, unknown>;
  spend: string;
}

export interface ParsedInsight {
  campaign: NormalizedAdCampaign;
  metric: NormalizedAdMetricDaily;
}

/** Upsert one campaign row, return its UUID. Handles parent linkage. */
const upsertCampaign = async (
  orgId: string,
  campaign: NormalizedAdCampaign
): Promise<string> => {
  let parentId: string | null = null;
  if (campaign.parentSourceCampaignId) {
    const parents = await database
      .select({ id: adCampaigns.id })
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.orgId, orgId),
          eq(adCampaigns.source, campaign.source),
          eq(adCampaigns.sourceCampaignId, campaign.parentSourceCampaignId)
        )
      )
      .limit(1);
    parentId = parents[0]?.id ?? null;
  }

  const inserted = await database
    .insert(adCampaigns)
    .values({
      orgId,
      source: campaign.source,
      sourceCampaignId: campaign.sourceCampaignId,
      name: campaign.name,
      level: campaign.level,
      status: campaign.status ?? null,
      objective: campaign.objective ?? null,
      parentCampaignId: parentId,
      startedAtSource: campaign.startedAtSource ?? null,
      endedAtSource: campaign.endedAtSource ?? null,
      sourceMetadata: campaign.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [
        adCampaigns.orgId,
        adCampaigns.source,
        adCampaigns.sourceCampaignId,
        adCampaigns.level,
      ],
      set: {
        name: campaign.name,
        status: campaign.status ?? null,
        objective: campaign.objective ?? null,
        parentCampaignId: parentId,
        sourceMetadata: campaign.sourceMetadata,
        computedAt: new Date(),
      },
    })
    .returning({ id: adCampaigns.id });

  const id = inserted[0]?.id;
  if (!id) {
    throw new Error("ad-spend apply: insert returned no id");
  }
  return id;
};

const upsertMetric = async (
  orgId: string,
  campaignDbId: string,
  metric: NormalizedAdMetricDaily
): Promise<void> => {
  await database
    .insert(adMetricsDaily)
    .values({
      orgId,
      source: metric.source,
      campaignId: campaignDbId,
      date: metric.date,
      currency: metric.currency,
      spend: metric.spend,
      impressions: metric.impressions,
      clicks: metric.clicks,
      conversions: metric.conversions.toFixed(2),
      conversionValue: metric.conversionValue,
      cpc: metric.cpc ?? null,
      ctr: metric.ctr ?? null,
      roasSource: metric.roasSource ?? null,
      sourceMetadata: metric.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [
        adMetricsDaily.orgId,
        adMetricsDaily.source,
        adMetricsDaily.campaignId,
        adMetricsDaily.date,
      ],
      set: {
        spend: metric.spend,
        impressions: metric.impressions,
        clicks: metric.clicks,
        conversions: metric.conversions.toFixed(2),
        conversionValue: metric.conversionValue,
        cpc: metric.cpc ?? null,
        ctr: metric.ctr ?? null,
        roasSource: metric.roasSource ?? null,
        sourceMetadata: metric.sourceMetadata,
        computedAt: new Date(),
      },
    });
};

export const applyParsedInsight = async (
  orgId: string,
  parsed: ParsedInsight
): Promise<{ campaignId: string }> => {
  const campaignId = await upsertCampaign(orgId, parsed.campaign);
  await upsertMetric(orgId, campaignId, parsed.metric);
  return { campaignId };
};

export const applyParsedInsights = async (
  orgId: string,
  parsed: readonly ParsedInsight[]
): Promise<number> => {
  let count = 0;
  // Two-pass: campaigns first (so parents exist before ad sets / ads
  // resolve), then ad_set, then ad. Stable order matches the upstream
  // backfill iterator's level passes, but we sort defensively.
  const order: Record<string, number> = {
    campaign: 0,
    ad_set: 1,
    ad_group: 1,
    ad: 2,
    keyword: 3,
  };
  const sorted = [...parsed].sort(
    (a, b) => (order[a.campaign.level] ?? 99) - (order[b.campaign.level] ?? 99)
  );
  for (const p of sorted) {
    await applyParsedInsight(orgId, p);
    count++;
  }
  return count;
};
