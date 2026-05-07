/**
 * @ai-cfo/anomaly — pure-function statistical primitives for daily anomaly
 * detection. No I/O, no DB, no network. The deterministic-truth layer above
 * passes us values; we return verdicts. Tunable via `OrgThresholds`.
 *
 * Iron Rule echo: severity is computed deterministically here. The agent
 * narrates anomalies; it does not invent them.
 */

import { getDay } from "date-fns";

export type Severity = "low" | "medium" | "high";

export interface SeriesPoint {
  date: Date;
  value: number;
}

export interface OrgThresholds {
  /** Minimum window size before z-scores are computed (default 7). */
  min_history?: number;
  /** Minimum |z-score| to flag high severity (default 3). */
  z_high?: number;
  /** Minimum |z-score| to flag medium severity (default 2). */
  z_medium?: number;
}

export interface AnomalyCandidate {
  baseline: number;
  date: Date;
  dow_delta_pct: number;
  metric: string;
  severity: Severity;
  value: number;
  z_score: number;
}

const DEFAULT_THRESHOLDS: Required<OrgThresholds> = {
  z_medium: 2,
  z_high: 3,
  min_history: 7,
};

/**
 * Rolling-window z-score of the LAST element in `values` against the previous
 * `window` elements. Returns 0 when history is insufficient.
 */
export const rollingZScore = (values: number[], window = 14): number => {
  if (values.length < 2) {
    return 0;
  }
  const target = values.at(-1);
  if (target === undefined) {
    return 0;
  }
  const history = values.slice(-window - 1, -1);
  if (history.length < 2) {
    return 0;
  }
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const variance =
    history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
  const std = Math.sqrt(variance);
  if (std === 0) {
    return 0;
  }
  return (target - mean) / std;
};

/**
 * Day-of-week aware delta: compares `targetDate`'s value against the average
 * of the four most recent same-DOW values in `series`. Returns the percentage
 * difference (target / sameDow_avg - 1) — e.g., 0.25 = +25%, -0.10 = -10%.
 * Returns 0 if there is no comparable history.
 */
export const dowAwareDelta = (
  series: SeriesPoint[],
  targetDate: Date
): number => {
  const targetDow = getDay(targetDate);
  const target = series.find(
    (p) => p.date.getTime() === targetDate.getTime()
  )?.value;
  if (target === undefined) {
    return 0;
  }
  const sameDow = series
    .filter(
      (p) =>
        getDay(p.date) === targetDow && p.date.getTime() < targetDate.getTime()
    )
    .slice(-4);
  if (sameDow.length === 0) {
    return 0;
  }
  const baseline = sameDow.reduce((s, p) => s + p.value, 0) / sameDow.length;
  if (baseline === 0) {
    return 0;
  }
  return target / baseline - 1;
};

/** Map a z-score to a severity bucket. */
export const severity = (
  z: number,
  thresholds: OrgThresholds = {}
): Severity => {
  const { z_medium, z_high } = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const abs = Math.abs(z);
  if (abs >= z_high) {
    return "high";
  }
  if (abs >= z_medium) {
    return "medium";
  }
  return "low";
};

export interface MetricSeries {
  metric: string;
  series: SeriesPoint[];
}

/**
 * Walk one or more metric series and emit anomaly candidates for whichever
 * point hits a non-low severity. Caller decides which candidates to persist.
 */
export const computeAnomalyCandidates = (
  metrics: MetricSeries[],
  thresholds: OrgThresholds = {}
): AnomalyCandidate[] => {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const out: AnomalyCandidate[] = [];

  for (const { metric, series } of metrics) {
    if (series.length < cfg.min_history) {
      continue;
    }
    const sorted = [...series].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    const last = sorted.at(-1);
    if (!last) {
      continue;
    }
    const values = sorted.map((p) => p.value);
    const z = rollingZScore(values);
    const sev = severity(z, cfg);
    if (sev === "low") {
      continue;
    }
    const dowDelta = dowAwareDelta(sorted, last.date);
    const baselineValues = values.slice(-15, -1);
    const baseline =
      baselineValues.length > 0
        ? baselineValues.reduce((s, v) => s + v, 0) / baselineValues.length
        : 0;
    out.push({
      date: last.date,
      metric,
      value: last.value,
      baseline,
      z_score: z,
      dow_delta_pct: dowDelta,
      severity: sev,
    });
  }

  return out;
};
