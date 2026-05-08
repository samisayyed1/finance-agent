/**
 * Server data fetcher for /today.
 *
 * Pulls the latest day's metrics, the prior 7-day average for the
 * headline delta, the top open flags + recent anomalies, sync health
 * for every connected source, and (if it exists) the latest AI report
 * row keyed by date.
 *
 * RLS-scoped via the Drizzle client; we add `eq(table.orgId, orgId)`
 * defensively for explicit clarity in case the policy is missed in
 * a future migration.
 */

import {
  and,
  anomalies,
  connectionAlerts,
  dailyMetrics,
  database,
  dataConnections,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  reconciliationFlags,
  reports,
  sql,
} from "@ai-cfo/database";

const PRIOR_DAYS = 7;
const TOP_ANOMALIES_LIMIT = 3;
const OPEN_FLAGS_LIMIT = 20;

export interface TodayDailyMetrics {
  readonly adSpend: string | null;
  readonly aov: string | null;
  readonly blendedMer: string | null;
  readonly cac: string | null;
  readonly date: string;
  readonly fees: string | null;
  readonly newCustomers: number | null;
  readonly orders: number | null;
  readonly refundRate: string | null;
  readonly refunds: string | null;
  readonly revenueGross: string | null;
  readonly revenueNet: string | null;
  readonly roas: string | null;
  readonly snapshotId: string;
}

export interface TodayAnomaly {
  readonly anomalyId: string;
  readonly date: string;
  readonly metric: string;
  readonly severity: string;
  readonly suggestedCause: string | null;
}

export interface TodayFlag {
  readonly createdAt: Date;
  readonly delta: string | null;
  readonly flagId: string;
  readonly kind: string;
  readonly status: string;
}

export interface TodaySyncHealth {
  readonly hasOpenAlert: boolean;
  readonly lastSyncedAt: Date | null;
  readonly source: string;
  readonly status: string;
}

export interface TodayReportSummary {
  readonly contentMd: string;
  readonly date: string;
  readonly traceId: string | null;
}

export interface TodayPageData {
  readonly daily: TodayDailyMetrics | null;
  readonly date: string | null;
  readonly openFlags: readonly TodayFlag[];
  readonly prior7dRevenueGrossAvg: string | null;
  readonly prior7dRevenueNetAvg: string | null;
  readonly report: TodayReportSummary | null;
  readonly syncHealth: readonly TodaySyncHealth[];
  readonly topAnomalies: readonly TodayAnomaly[];
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const subDays = (d: Date, days: number): Date => {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
};

const toDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

const fetchLatestDailyAndPrior = async (
  orgId: string
): Promise<{
  daily: TodayDailyMetrics | null;
  priorGrossAvg: string | null;
  priorNetAvg: string | null;
}> => {
  const rows = await database
    .select()
    .from(dailyMetrics)
    .where(eq(dailyMetrics.orgId, orgId))
    .orderBy(desc(dailyMetrics.date))
    .limit(1);
  const top = rows[0];
  if (!top) {
    return { daily: null, priorGrossAvg: null, priorNetAvg: null };
  }
  const cutoff = isoDate(subDays(toDate(top.date), PRIOR_DAYS));
  const priorRows = await database
    .select({
      grossAvg: sql<string | null>`avg(${dailyMetrics.revenueGross})::text`,
      netAvg: sql<string | null>`avg(${dailyMetrics.revenueNet})::text`,
    })
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.orgId, orgId),
        gte(dailyMetrics.date, cutoff),
        sql`${dailyMetrics.date} < ${top.date}`
      )
    );
  return {
    daily: {
      adSpend: top.adSpend,
      aov: top.aov,
      blendedMer: top.blendedMer,
      cac: top.cac,
      date: top.date,
      fees: top.fees,
      newCustomers: top.newCustomers,
      orders: top.orders,
      refundRate: top.refundRate,
      refunds: top.refunds,
      revenueGross: top.revenueGross,
      revenueNet: top.revenueNet,
      roas: top.roas,
      snapshotId: top.snapshotId,
    },
    priorGrossAvg: priorRows[0]?.grossAvg ?? null,
    priorNetAvg: priorRows[0]?.netAvg ?? null,
  };
};

const fetchTopAnomalies = async (
  orgId: string
): Promise<readonly TodayAnomaly[]> => {
  // Severity ordering: high > medium > low. SQL CASE keeps it deterministic.
  const rows = await database
    .select({
      anomalyId: anomalies.anomalyId,
      date: anomalies.date,
      metric: anomalies.metric,
      severity: anomalies.severity,
      suggestedCause: anomalies.suggestedCause,
    })
    .from(anomalies)
    .where(eq(anomalies.orgId, orgId))
    .orderBy(
      sql`CASE ${anomalies.severity} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      desc(anomalies.createdAt)
    )
    .limit(TOP_ANOMALIES_LIMIT);
  return rows;
};

const fetchOpenFlags = async (orgId: string): Promise<readonly TodayFlag[]> => {
  const rows = await database
    .select({
      createdAt: reconciliationFlags.createdAt,
      delta: reconciliationFlags.delta,
      flagId: reconciliationFlags.flagId,
      kind: reconciliationFlags.kind,
      status: reconciliationFlags.status,
    })
    .from(reconciliationFlags)
    .where(
      and(
        eq(reconciliationFlags.orgId, orgId),
        inArray(reconciliationFlags.status, ["open", "investigating"])
      )
    )
    .orderBy(desc(reconciliationFlags.createdAt))
    .limit(OPEN_FLAGS_LIMIT);
  return rows;
};

const fetchSyncHealth = async (
  orgId: string
): Promise<readonly TodaySyncHealth[]> => {
  // Latest connection row per source (one row per source by RLS scope).
  const conns = await database
    .select({
      lastSyncedAt: dataConnections.lastSyncedAt,
      source: dataConnections.source,
      status: dataConnections.status,
    })
    .from(dataConnections)
    .where(eq(dataConnections.orgId, orgId));
  const alerts = await database
    .select({ source: connectionAlerts.source })
    .from(connectionAlerts)
    .where(
      and(
        eq(connectionAlerts.orgId, orgId),
        isNull(connectionAlerts.resolvedAt)
      )
    );
  const alertSources = new Set(alerts.map((a) => a.source));
  return conns.map((c) => ({
    hasOpenAlert: alertSources.has(c.source),
    lastSyncedAt: c.lastSyncedAt,
    source: c.source,
    status: c.status,
  }));
};

const fetchLatestReport = async (
  orgId: string
): Promise<TodayReportSummary | null> => {
  const rows = await database
    .select({
      contentMd: reports.contentMd,
      date: reports.date,
      traceId: reports.aiTraceId,
    })
    .from(reports)
    .where(eq(reports.orgId, orgId))
    .orderBy(desc(reports.date))
    .limit(1);
  return rows[0] ?? null;
};

export const fetchTodayPageData = async (
  orgId: string
): Promise<TodayPageData> => {
  const [
    { daily, priorGrossAvg, priorNetAvg },
    anomaliesRows,
    flagsRows,
    sync,
    report,
  ] = await Promise.all([
    fetchLatestDailyAndPrior(orgId),
    fetchTopAnomalies(orgId),
    fetchOpenFlags(orgId),
    fetchSyncHealth(orgId),
    fetchLatestReport(orgId),
  ]);
  return {
    daily,
    date: daily?.date ?? null,
    openFlags: flagsRows,
    prior7dRevenueGrossAvg: priorGrossAvg,
    prior7dRevenueNetAvg: priorNetAvg,
    report,
    syncHealth: sync,
    topAnomalies: anomaliesRows,
  };
};
