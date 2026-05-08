/**
 * Day-6: ad-platform-vs-Shopify attribution drift detection.
 *
 * PURE function. Source-agnostic in spirit (iron rule #10): operates on
 * canonical AdMetricDailySummary + OrderForAttribution shapes — no
 * Meta/Google-specific assumptions. Today only `meta` and `google` are
 * the comparison sources because no other ad platform yet emits the
 * `attribution.inferred_marketing_source` field; expanding to TikTok is
 * a one-line addition to AD_SOURCES once that connector lands.
 */

export type AdSource = "meta" | "google";

export const AD_SOURCES: readonly AdSource[] = ["meta", "google"] as const;

export interface AdMetricDailySummary {
  /** Reported conversions for the date (sum across campaigns). */
  conversions: number;
  source: AdSource;
}

export interface OrderForAttribution {
  /** From orders.source_metadata.attribution.inferred_marketing_source. */
  inferredMarketingSource:
    | "meta"
    | "google"
    | "tiktok"
    | "klaviyo"
    | "organic"
    | "other";
}

export interface AttributionMismatchInput {
  adMetrics: readonly AdMetricDailySummary[];
  date: Date;
  orders: readonly OrderForAttribution[];
  orgId: string;
  thresholds?: {
    /** Default 0.25 (25% drift). */
    minDriftPct?: number;
    /** Default 3 (absolute conversion delta). */
    minDelta?: number;
  };
}

export interface AttributionMismatchResult {
  adSource: AdSource;
  classification: "utm_based";
  date: Date;
  driftAbs: number;
  driftPct: number;
  observedOrders: number;
  orgId: string;
  reportedConversions: number;
  severity: "low" | "medium" | "high";
}

const DEFAULT_MIN_DRIFT_PCT = 0.25;
const DEFAULT_MIN_DELTA = 3;
const HIGH_SEVERITY_PCT = 0.5;
const MEDIUM_SEVERITY_PCT = 0.3;

const severityFor = (driftPct: number): "low" | "medium" | "high" => {
  if (driftPct >= HIGH_SEVERITY_PCT) {
    return "high";
  }
  if (driftPct >= MEDIUM_SEVERITY_PCT) {
    return "medium";
  }
  return "low";
};

export const detectAttributionMismatch = (
  input: AttributionMismatchInput
): AttributionMismatchResult[] => {
  const minDriftPct = input.thresholds?.minDriftPct ?? DEFAULT_MIN_DRIFT_PCT;
  const minDelta = input.thresholds?.minDelta ?? DEFAULT_MIN_DELTA;

  const observedBySource = new Map<AdSource, number>();
  for (const o of input.orders) {
    const s = o.inferredMarketingSource;
    if (s === "meta" || s === "google") {
      observedBySource.set(s, (observedBySource.get(s) ?? 0) + 1);
    }
  }

  const reportedBySource = new Map<AdSource, number>();
  for (const m of input.adMetrics) {
    reportedBySource.set(
      m.source,
      (reportedBySource.get(m.source) ?? 0) + m.conversions
    );
  }

  const out: AttributionMismatchResult[] = [];
  for (const source of AD_SOURCES) {
    const reported = reportedBySource.get(source) ?? 0;
    const observed = observedBySource.get(source) ?? 0;
    if (reported === 0 && observed === 0) {
      continue;
    }
    const driftAbs = Math.abs(reported - observed);
    const denom = Math.max(reported, observed, 1);
    const driftPct = driftAbs / denom;
    if (driftPct < minDriftPct || driftAbs < minDelta) {
      continue;
    }
    out.push({
      orgId: input.orgId,
      date: input.date,
      adSource: source,
      reportedConversions: reported,
      observedOrders: observed,
      driftPct,
      driftAbs,
      classification: "utm_based",
      severity: severityFor(driftPct),
    });
  }
  return out;
};
