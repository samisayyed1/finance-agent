/**
 * Server data fetcher for /metrics. Returns the requested-range slice
 * of `daily_metrics` in ascending date order with numeric coercion —
 * Drizzle returns NUMERIC columns as strings; we convert to
 * `number | null` here so chart components can do shape-only work
 * downstream.
 */

import { and, dailyMetrics, database, desc, eq, gte } from "@ai-cfo/database";

export const SUPPORTED_RANGES = [7, 30, 90] as const;
export type MetricsRange = (typeof SUPPORTED_RANGES)[number];

export interface MetricsRow {
  readonly adSpend: number | null;
  readonly aov: number | null;
  readonly blendedMer: number | null;
  readonly cac: number | null;
  readonly date: string;
  readonly newCustomers: number | null;
  readonly orders: number | null;
  readonly refundRate: number | null;
  readonly revenueGross: number | null;
  readonly revenueNet: number | null;
  readonly roas: number | null;
}

const toNum = (s: string | null): number | null => {
  if (s === null) {
    return null;
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const subDays = (d: Date, days: number): Date => {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
};

export const fetchMetricsRange = async (
  orgId: string,
  days: MetricsRange
): Promise<readonly MetricsRow[]> => {
  // Anchor on the latest row so the range is always populated even if
  // the most recent backfill is a couple of days behind today.
  const latest = await database
    .select({ date: dailyMetrics.date })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.orgId, orgId))
    .orderBy(desc(dailyMetrics.date))
    .limit(1);
  const anchor = latest[0]?.date;
  if (!anchor) {
    return [];
  }
  const cutoff = isoDate(subDays(new Date(`${anchor}T00:00:00Z`), days - 1));
  const rows = await database
    .select({
      adSpend: dailyMetrics.adSpend,
      aov: dailyMetrics.aov,
      blendedMer: dailyMetrics.blendedMer,
      cac: dailyMetrics.cac,
      date: dailyMetrics.date,
      newCustomers: dailyMetrics.newCustomers,
      orders: dailyMetrics.orders,
      refundRate: dailyMetrics.refundRate,
      revenueGross: dailyMetrics.revenueGross,
      revenueNet: dailyMetrics.revenueNet,
      roas: dailyMetrics.roas,
    })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.orgId, orgId), gte(dailyMetrics.date, cutoff)))
    .orderBy(dailyMetrics.date);
  return rows.map((r) => ({
    adSpend: toNum(r.adSpend),
    aov: toNum(r.aov),
    blendedMer: toNum(r.blendedMer),
    cac: toNum(r.cac),
    date: r.date,
    newCustomers: r.newCustomers,
    orders: r.orders,
    refundRate: toNum(r.refundRate),
    revenueGross: toNum(r.revenueGross),
    revenueNet: toNum(r.revenueNet),
    roas: toNum(r.roas),
  }));
};

export const isSupportedRange = (n: number): n is MetricsRange =>
  (SUPPORTED_RANGES as readonly number[]).includes(n);
