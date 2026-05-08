/**
 * Day-8 thin wrapper around `@ai-cfo/anomaly`.
 *
 * The anomaly package itself stays pure — `computeAnomalyCandidates` returns
 * verdicts, no I/O. Production reads from `daily_metrics` and persists into
 * `anomalies` via this job; the agent retrieves rows via MCP. Today we
 * introduce the persistence half so the seeder can run the full pipeline
 * for a day and have `/today` light up.
 */

import {
  computeAnomalyCandidates,
  type MetricSeries,
  type OrgThresholds,
} from "@ai-cfo/anomaly";
import {
  and,
  anomalies,
  dailyMetrics,
  database,
  eq,
  lte,
  sql,
} from "@ai-cfo/database";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

interface MetricColumnSpec {
  col: keyof typeof dailyMetrics.$inferSelect;
  metric: string;
}

const METRICS: MetricColumnSpec[] = [
  { metric: "revenue_gross", col: "revenueGross" },
  { metric: "revenue_net", col: "revenueNet" },
  { metric: "refunds", col: "refunds" },
  { metric: "ad_spend", col: "adSpend" },
  { metric: "roas", col: "roas" },
  { metric: "cac", col: "cac" },
  { metric: "aov", col: "aov" },
  { metric: "refund_rate", col: "refundRate" },
];

interface RunArgs {
  date: Date;
  orgId: string;
  thresholds?: OrgThresholds;
}

export interface RunAnomalyResult {
  anomalyIds: string[];
  candidatesConsidered: number;
  candidatesPersisted: number;
}

export const runAnomalyJobForDay = async (
  args: RunArgs
): Promise<RunAnomalyResult> => {
  const targetDate = isoDate(args.date);
  const windowStart = isoDate(new Date(args.date.getTime() - FOURTEEN_DAYS_MS));

  const rows = await database
    .select()
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.orgId, args.orgId),
        // half-open: [windowStart, targetDate]
        lte(dailyMetrics.date, targetDate),
        sql`${dailyMetrics.date} >= ${windowStart}`
      )
    )
    .orderBy(dailyMetrics.date);

  const metricsForAnomaly: MetricSeries[] = METRICS.map(({ metric, col }) => {
    const series = rows
      .filter((r) => r[col] !== null && r[col] !== undefined)
      .map((r) => ({
        date: new Date(`${r.date}T00:00:00Z`),
        value: Number(r[col]),
      }))
      .filter((p) => Number.isFinite(p.value));
    return { metric, series };
  });

  const candidates = computeAnomalyCandidates(
    metricsForAnomaly,
    args.thresholds
  );

  const targetDateRows = candidates.filter(
    (c) => isoDate(c.date) === targetDate
  );

  const persistedIds: string[] = [];
  for (const c of targetDateRows) {
    const anomalyId = `${args.orgId}::${c.metric}::${targetDate}`;
    await database
      .insert(anomalies)
      .values({
        orgId: args.orgId,
        anomalyId,
        date: targetDate,
        metric: c.metric,
        severity: c.severity,
        zScore: c.z_score.toFixed(4),
        prevValue: c.baseline.toFixed(4),
        currentValue: c.value.toFixed(4),
        suggestedCause: null,
      })
      .onConflictDoUpdate({
        target: anomalies.anomalyId,
        set: {
          severity: c.severity,
          zScore: c.z_score.toFixed(4),
          prevValue: c.baseline.toFixed(4),
          currentValue: c.value.toFixed(4),
        },
      });
    persistedIds.push(anomalyId);
  }

  return {
    candidatesConsidered: candidates.length,
    candidatesPersisted: persistedIds.length,
    anomalyIds: persistedIds,
  };
};
