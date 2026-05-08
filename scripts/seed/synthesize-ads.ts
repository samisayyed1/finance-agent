/**
 * Synthesize Meta + Google ad spend that aligns with the orders stream.
 *
 * For each day:
 *   - total spend = (paidShare * dailyRevenue) / blendedRoas
 *   - 62% Meta / 38% Google by spend
 *   - 3 Meta campaigns + 2 Google campaigns
 *   - conversions per campaign tracked from UTM-attributed orders
 *   - META_ATTRIBUTION_DRIFT window: Meta conversions overstated 30%
 *   - META_ROAS_COLLAPSE window: Meta broad-audience ROAS slides 4.1→1.8
 */

import type { Rng } from "./rng";
import type { AnomalyDef, Scenario } from "./scenario-maeve";
import type { SyntheticOrder } from "./synthesize-orders";

export interface SyntheticAdCampaign {
  level: "campaign";
  name: string;
  objective: string;
  source: "meta" | "google";
  sourceCampaignId: string;
  status: "ACTIVE";
}

export interface SyntheticAdMetricDaily {
  clicks: number;
  conversions: number;
  conversionValueMinor: number;
  currency: string;
  date: Date;
  impressions: number;
  source: "meta" | "google";
  sourceCampaignId: string;
  spendMinor: number;
}

export interface SyntheticAds {
  campaigns: SyntheticAdCampaign[];
  metricsDaily: SyntheticAdMetricDaily[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const dayOffsetFromEnd = (day: Date, end: Date): number =>
  Math.round((day.getTime() - end.getTime()) / ONE_DAY_MS);

const inWindow = (daysAgo: number, a: AnomalyDef): boolean =>
  daysAgo <= a.daysAgoStart && daysAgo >= a.daysAgoEnd;

const META_CAMPAIGNS: { id: string; name: string; weight: number }[] = [
  { id: "fb_acq_broad", name: "FB / IG — Broad Acquisition", weight: 0.5 },
  { id: "fb_acq_lal_1pct", name: "FB / IG — Lookalike 1%", weight: 0.3 },
  { id: "fb_retargeting", name: "FB / IG — Retargeting", weight: 0.2 },
];

const GOOGLE_CAMPAIGNS: { id: string; name: string; weight: number }[] = [
  { id: "g_branded", name: "Search — Branded", weight: 0.45 },
  { id: "g_shopping", name: "Shopping — All Products", weight: 0.55 },
];

const buildCampaigns = (): SyntheticAdCampaign[] => {
  const out: SyntheticAdCampaign[] = [];
  for (const c of META_CAMPAIGNS) {
    out.push({
      source: "meta",
      sourceCampaignId: c.id,
      name: c.name,
      status: "ACTIVE",
      objective: "OUTCOME_SALES",
      level: "campaign",
    });
  }
  for (const c of GOOGLE_CAMPAIGNS) {
    out.push({
      source: "google",
      sourceCampaignId: c.id,
      name: c.name,
      status: "ACTIVE",
      objective: "MAXIMIZE_CONVERSIONS",
      level: "campaign",
    });
  }
  return out;
};

interface DayRollup {
  date: Date;
  daysAgo: number;
  googleOrderCount: number;
  googleOrderValueMinor: number;
  metaOrderCount: number;
  metaOrderValueMinor: number;
}

const buildDayRollups = (
  orders: SyntheticOrder[],
  end: Date
): Map<string, DayRollup> => {
  const map = new Map<string, DayRollup>();
  for (const o of orders) {
    const day = startOfUtcDay(o.createdAtSource);
    const key = day.toISOString();
    let rollup = map.get(key);
    if (!rollup) {
      rollup = {
        date: day,
        daysAgo: dayOffsetFromEnd(day, end),
        metaOrderValueMinor: 0,
        metaOrderCount: 0,
        googleOrderValueMinor: 0,
        googleOrderCount: 0,
      };
      map.set(key, rollup);
    }
    if (o.cancelledAtSource !== null || o.financialStatus === "pending") {
      continue;
    }
    if (o.attributionChannel === "meta") {
      rollup.metaOrderValueMinor += o.totalMinor;
      rollup.metaOrderCount += 1;
    } else if (o.attributionChannel === "google") {
      rollup.googleOrderValueMinor += o.totalMinor;
      rollup.googleOrderCount += 1;
    }
  }
  return map;
};

const dailyTotalRevenueMinor = (
  orders: SyntheticOrder[]
): Map<string, number> => {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (o.cancelledAtSource !== null || o.financialStatus === "pending") {
      continue;
    }
    const k = startOfUtcDay(o.createdAtSource).toISOString();
    m.set(k, (m.get(k) ?? 0) + o.totalMinor);
  }
  return m;
};

interface MetaSpendShape {
  perCampaign: Record<string, number>;
  totalMinor: number;
}

const metaSpendForDay = (
  totalMetaSpendMinor: number,
  daysAgo: number,
  scenario: Scenario
): MetaSpendShape => {
  // ROAS-collapse window inflates broad-audience spend (operator over-funds it
  // even as conversions tank). We bump broad's share linearly across the
  // window; ad-set rotates back to baseline outside of it.
  const collapse = scenario.anomalies.find(
    (a) => a.kind === "META_ROAS_COLLAPSE"
  );
  let broadWeight = META_CAMPAIGNS[0]?.weight ?? 0.5;
  if (collapse && inWindow(daysAgo, collapse)) {
    broadWeight = 0.7;
  }
  const lalWeight = META_CAMPAIGNS[1]?.weight ?? 0.3;
  const retargWeight = 1 - broadWeight - lalWeight;
  const perCampaign: Record<string, number> = {
    fb_acq_broad: Math.round(totalMetaSpendMinor * broadWeight),
    fb_acq_lal_1pct: Math.round(totalMetaSpendMinor * lalWeight),
    fb_retargeting: Math.max(0, Math.round(totalMetaSpendMinor * retargWeight)),
  };
  return { totalMinor: totalMetaSpendMinor, perCampaign };
};

interface GoogleSpendShape {
  perCampaign: Record<string, number>;
  totalMinor: number;
}

const googleSpendForDay = (totalGoogleSpendMinor: number): GoogleSpendShape => {
  const perCampaign: Record<string, number> = {
    g_branded: Math.round(
      totalGoogleSpendMinor * (GOOGLE_CAMPAIGNS[0]?.weight ?? 0.45)
    ),
    g_shopping: Math.round(
      totalGoogleSpendMinor * (GOOGLE_CAMPAIGNS[1]?.weight ?? 0.55)
    ),
  };
  return { totalMinor: totalGoogleSpendMinor, perCampaign };
};

interface MetaCampaignMetricsArgs {
  baseConversions: number;
  baseConversionValueMinor: number;
  campaignId: string;
  date: Date;
  daysAgo: number;
  rng: Rng;
  scenario: Scenario;
  spendMinor: number;
}

const metaCampaignMetrics = (
  a: MetaCampaignMetricsArgs
): SyntheticAdMetricDaily => {
  const cpm = 22 + a.rng.nextFloat() * 6;
  const ctr = 0.014 + a.rng.nextFloat() * 0.004;
  const impressions = Math.round((a.spendMinor / 100 / cpm) * 1000);
  const clicks = Math.round(impressions * ctr);

  // Default conversions/value follow the order rollup proportionally.
  let conversions = a.baseConversions;
  let conversionValueMinor = a.baseConversionValueMinor;

  // Attribution-drift anomaly inflates Meta's reported conversions/value.
  const drift = a.scenario.anomalies.find(
    (an) => an.kind === "META_ATTRIBUTION_DRIFT"
  );
  if (
    drift &&
    a.daysAgo <= drift.daysAgoStart &&
    a.daysAgo >= drift.daysAgoEnd
  ) {
    const factor = drift.params.overReportFactor ?? 1.3;
    conversions = Math.round(conversions * factor);
    conversionValueMinor = Math.round(conversionValueMinor * factor);
  }

  // ROAS-collapse anomaly suppresses broad-campaign conversion value.
  const collapse = a.scenario.anomalies.find(
    (an) => an.kind === "META_ROAS_COLLAPSE"
  );
  if (
    collapse &&
    a.campaignId === "fb_acq_broad" &&
    a.daysAgo <= collapse.daysAgoStart &&
    a.daysAgo >= collapse.daysAgoEnd
  ) {
    const start = collapse.params.startRoas ?? 4.1;
    const finish = collapse.params.endRoas ?? 1.8;
    const span = collapse.daysAgoStart - collapse.daysAgoEnd;
    const t = span === 0 ? 1 : (collapse.daysAgoStart - a.daysAgo) / span;
    const roasNow = start + (finish - start) * Math.min(Math.max(t, 0), 1);
    // Force conversion_value = spend * roasNow (ignore organic ratio).
    conversionValueMinor = Math.max(
      0,
      Math.round((a.spendMinor / 100) * roasNow * 100)
    );
  }

  return {
    source: "meta",
    sourceCampaignId: a.campaignId,
    date: a.date,
    currency: a.scenario.currency,
    spendMinor: a.spendMinor,
    impressions,
    clicks,
    conversions,
    conversionValueMinor,
  };
};

interface GoogleCampaignMetricsArgs {
  baseConversions: number;
  baseConversionValueMinor: number;
  campaignId: string;
  date: Date;
  rng: Rng;
  scenario: Scenario;
  spendMinor: number;
}

const googleCampaignMetrics = (
  a: GoogleCampaignMetricsArgs
): SyntheticAdMetricDaily => {
  const cpc = 1.4 + a.rng.nextFloat() * 0.6;
  const ctr = 0.038 + a.rng.nextFloat() * 0.005;
  const clicks = Math.round(a.spendMinor / 100 / cpc);
  const impressions = Math.max(
    clicks,
    Math.round(clicks / Math.max(ctr, 0.0001))
  );
  return {
    source: "google",
    sourceCampaignId: a.campaignId,
    date: a.date,
    currency: a.scenario.currency,
    spendMinor: a.spendMinor,
    impressions,
    clicks,
    conversions: a.baseConversions,
    conversionValueMinor: a.baseConversionValueMinor,
  };
};

export const synthesizeAdSpend = (
  orders: SyntheticOrder[],
  scenario: Scenario,
  rng: Rng,
  windowEnd: Date
): SyntheticAds => {
  const end = startOfUtcDay(windowEnd);
  const campaigns = buildCampaigns();
  const dailyRevenueByDay = dailyTotalRevenueMinor(orders);
  const rollups = buildDayRollups(orders, end);
  const metrics: SyntheticAdMetricDaily[] = [];

  for (const [, rollup] of rollups) {
    const dayRevenueMinor =
      dailyRevenueByDay.get(rollup.date.toISOString()) ?? 0;
    const blendedRoas =
      (scenario.baselineMetaRoas + scenario.baselineGoogleRoas) / 2;
    const totalSpendMinor = Math.round(
      (scenario.paidShare * dayRevenueMinor) / Math.max(blendedRoas, 0.5)
    );
    const metaSpend = metaSpendForDay(
      Math.round(totalSpendMinor * scenario.paidSplit.meta),
      rollup.daysAgo,
      scenario
    );
    const googleSpend = googleSpendForDay(
      Math.round(totalSpendMinor * scenario.paidSplit.google)
    );

    // Distribute meta's order rollup proportionally across its campaigns.
    for (const c of META_CAMPAIGNS) {
      const weight = c.weight;
      const baseConversions = Math.round(rollup.metaOrderCount * weight);
      const baseConversionValueMinor = Math.round(
        rollup.metaOrderValueMinor * weight
      );
      metrics.push(
        metaCampaignMetrics({
          rng,
          date: rollup.date,
          campaignId: c.id,
          spendMinor: metaSpend.perCampaign[c.id] ?? 0,
          scenario,
          daysAgo: rollup.daysAgo,
          baseConversions,
          baseConversionValueMinor,
        })
      );
    }

    for (const c of GOOGLE_CAMPAIGNS) {
      const weight = c.weight;
      const baseConversions = Math.round(rollup.googleOrderCount * weight);
      const baseConversionValueMinor = Math.round(
        rollup.googleOrderValueMinor * weight
      );
      metrics.push(
        googleCampaignMetrics({
          rng,
          date: rollup.date,
          campaignId: c.id,
          spendMinor: googleSpend.perCampaign[c.id] ?? 0,
          scenario,
          baseConversions,
          baseConversionValueMinor,
        })
      );
    }
  }

  return { campaigns, metricsDaily: metrics };
};
