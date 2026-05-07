/**
 * @ai-cfo/metrics — cent-exact daily metrics computation.
 *
 * Iron Rule #1: the LLM never computes a number. It calls
 * `computeDailyMetrics(orgId, date)` (here) via MCP. All monetary arithmetic
 * uses Dinero.js — never raw `number`.
 */

import {
  and,
  dailyMetrics,
  database,
  eq,
  gte,
  lt,
  orders,
  payments,
  refunds,
} from "@ai-cfo/database";
import {
  computeDailyMetricsFromRows,
  type DailyMetricsOutput,
} from "./compute-daily-metrics";

export {
  computeDailyMetricsFromRows,
  computeShopifyDailyMetricsFromRows,
  type DailyMetricsInput,
  type DailyMetricsOutput,
  type OrderRow,
  type PaymentRow,
  type RefundRow,
  type ShopifyDailyMetricsInput,
  type ShopifyDailyMetricsOutput,
} from "./compute-daily-metrics";
export {
  decimalStringToMinor,
  dineroFromMinor,
  dineroToDecimalString,
  dineroZero,
  sumDinero,
} from "./money";

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const startOfNextUtcDay = (d: Date): Date => {
  const start = startOfUtcDay(d);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
};

export interface ComputeArgs {
  date: Date;
  orgId: string;
}

export const computeDailyMetrics = async (
  args: ComputeArgs
): Promise<DailyMetricsOutput> => {
  const dayStart = startOfUtcDay(args.date);
  const dayEnd = startOfNextUtcDay(args.date);

  const ordersForDate = await database
    .select({
      source: orders.source,
      currency: orders.currency,
      total: orders.total,
      createdAtSource: orders.createdAtSource,
      cancelledAtSource: orders.cancelledAtSource,
    })
    .from(orders)
    .where(
      and(
        eq(orders.orgId, args.orgId),
        eq(orders.source, "shopify"),
        gte(orders.createdAtSource, dayStart),
        lt(orders.createdAtSource, dayEnd)
      )
    );

  const refundsForDate = await database
    .select({
      source: refunds.source,
      currency: refunds.currency,
      amount: refunds.amount,
      processedAt: refunds.processedAt,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.orgId, args.orgId),
        gte(refunds.processedAt, dayStart),
        lt(refunds.processedAt, dayEnd)
      )
    );

  const paymentsForDate = await database
    .select({
      source: payments.source,
      status: payments.status,
      currency: payments.currency,
      feeAmount: payments.feeAmount,
      processedAt: payments.processedAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.orgId, args.orgId),
        eq(payments.source, "stripe"),
        gte(payments.processedAt, dayStart),
        lt(payments.processedAt, dayEnd)
      )
    );

  const result = computeDailyMetricsFromRows({
    orgId: args.orgId,
    date: args.date,
    ordersForDate,
    refundsForDate,
    paymentsForDate,
  });

  await database
    .insert(dailyMetrics)
    .values({
      orgId: args.orgId,
      date: result.date,
      snapshotId: result.snapshot_id,
      revenueGross: result.revenue_gross,
      revenueNet: result.revenue_net,
      refunds: result.refunds,
      fees: result.fees,
      adSpend: result.ad_spend,
      grossMargin: result.gross_margin,
      contributionProfit: result.contribution_profit,
      roas: result.roas,
      blendedMer: result.blended_mer,
      cac: result.cac,
      aov: result.aov,
      orders: result.orders,
      newCustomers: result.new_customers,
      refundRate: result.refund_rate,
    })
    .onConflictDoUpdate({
      target: [dailyMetrics.orgId, dailyMetrics.date],
      set: {
        snapshotId: result.snapshot_id,
        revenueGross: result.revenue_gross,
        revenueNet: result.revenue_net,
        refunds: result.refunds,
        fees: result.fees,
        contributionProfit: result.contribution_profit,
        aov: result.aov,
        orders: result.orders,
        computedAt: new Date(),
      },
    });

  return result;
};
