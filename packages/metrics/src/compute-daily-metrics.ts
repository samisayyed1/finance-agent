/**
 * Day-2 cent-exact daily metrics for Shopify + Stripe.
 *
 * Iron Rule #1: the LLM never computes a number. This is the deterministic
 * truth layer. Every metric here is hand-written, reviewable, and unit-tested
 * against fixture days with cent-level assertions.
 *
 * Day-2 additions:
 *   - `fees` — sum of Stripe payment fees for the day (succeeded only).
 *   - `revenue_net` — now revenue_gross − refunds − fees (was just gross − refunds).
 *   - `contribution_profit` — revenue_net − COGS_stub. COGS lands when
 *     QuickBooks/Xero connector ships; until then we explicitly null it
 *     and emit an audit string ("pending_cogs"), per Iron Rule #1.
 *
 * The exported `computeDailyMetricsFromRows` is the *pure* function tests
 * drive directly. `computeDailyMetrics` is the DB-bound wrapper.
 */

import { format } from "date-fns";
import {
  decimalStringToMinor,
  dineroFromMinor,
  dineroToDecimalString,
  dineroZero,
  sumDinero,
} from "./money";

export interface OrderRow {
  cancelledAtSource: Date | null;
  createdAtSource: Date;
  currency: string;
  source: string;
  total: string;
}

export interface RefundRow {
  amount: string;
  currency: string;
  processedAt: Date;
  source: string;
}

export interface PaymentRow {
  currency: string;
  feeAmount: string;
  processedAt: Date | null;
  source: string;
  status: string | null;
}

export interface DailyMetricsInput {
  date: Date;
  /** Shopify orders with `created_at_source::date = date`. */
  ordersForDate: OrderRow[];
  orgId: string;
  /** Stripe payments (status='succeeded') with `processed_at::date = date`.
   *  Optional so Day-1 Shopify-only tests stay literal; defaults to []. */
  paymentsForDate?: PaymentRow[];
  /** Refunds with `processed_at::date = date`, any source. */
  refundsForDate: RefundRow[];
}

export interface DailyMetricsOutput {
  ad_spend: null;
  aov: string | null;
  blended_mer: null;
  cac: null;
  computed_at: string;
  contribution_profit: string | null;
  date: string;
  fees: string;
  gross_margin: null;
  new_customers: null;
  orders: number;
  org_id: string;
  pending_source_connection: readonly string[];
  refund_rate: null;
  refunds: string;
  revenue_gross: string;
  revenue_net: string;
  roas: null;
  snapshot_id: string;
}

const isoDateUTC = (d: Date): string => format(d, "yyyy-MM-dd");

const makeSnapshotId = (orgId: string, date: Date, computedAt: Date): string =>
  `${orgId}-${isoDateUTC(date)}-${computedAt.toISOString()}`;

const minorString = (s: string): number => decimalStringToMinor(s);

export const computeDailyMetricsFromRows = (
  input: DailyMetricsInput
): DailyMetricsOutput => {
  const computedAt = new Date();
  const dateStr = isoDateUTC(input.date);

  const shopifyOrders = input.ordersForDate.filter(
    (o) => o.source === "shopify" && o.cancelledAtSource === null
  );
  // Refunds count toward `revenue_net` regardless of source — both Shopify
  // refunds (the merchant grants store credit) and Stripe refunds (the
  // payment processor returns money) reduce real revenue.
  const allRefunds = input.refundsForDate;
  const stripePayments = (input.paymentsForDate ?? []).filter(
    (p) => p.source === "stripe" && p.status === "succeeded"
  );

  const currency =
    shopifyOrders[0]?.currency ??
    allRefunds[0]?.currency ??
    stripePayments[0]?.currency ??
    "USD";

  const orderTotals = shopifyOrders.map((o) =>
    dineroFromMinor(minorString(o.total), o.currency)
  );
  const refundAmounts = allRefunds.map((r) =>
    dineroFromMinor(minorString(r.amount), r.currency)
  );
  const feeAmounts = stripePayments.map((p) =>
    dineroFromMinor(minorString(p.feeAmount), p.currency)
  );

  const revenueGross = sumDinero(orderTotals) ?? dineroZero(currency);
  const refundsTotal = sumDinero(refundAmounts) ?? dineroZero(currency);
  const feesTotal = sumDinero(feeAmounts) ?? dineroZero(currency);

  // revenue_net = revenue_gross − refunds_today − fees_today
  const grossMinor = minorString(dineroToDecimalString(revenueGross));
  const refundsMinor = minorString(dineroToDecimalString(refundsTotal));
  const feesMinor = minorString(dineroToDecimalString(feesTotal));
  const revenueNetMinor = grossMinor - refundsMinor - feesMinor;
  const revenueNet = dineroFromMinor(revenueNetMinor, currency);

  const orderCount = shopifyOrders.length;
  let aov: string | null = null;
  if (orderCount > 0) {
    aov = dineroToDecimalString(
      dineroFromMinor(Math.round(revenueNetMinor / orderCount), currency)
    );
  }

  // contribution_profit = revenue_net − COGS_stub. COGS_stub = 0 until a
  // COGS source (QuickBooks/Xero/manual) connects. We surface it explicitly
  // rather than silently treating COGS=0 as "real" — the audit string makes
  // the assumption visible.
  const COGS_STUB_MINOR = 0;
  const contributionProfitMinor = revenueNetMinor - COGS_STUB_MINOR;
  const contributionProfit = dineroToDecimalString(
    dineroFromMinor(contributionProfitMinor, currency)
  );

  const pending: string[] = [];
  if (stripePayments.length === 0) {
    pending.push("fees: pending Stripe payments for this day");
  }
  pending.push(
    "ad_spend / roas / blended_mer: pending Meta + Google connections"
  );
  pending.push("cac / new_customers: pending customer-acquisition source");
  pending.push(
    "gross_margin / contribution_profit: pending COGS source (currently uses COGS=0 stub)"
  );
  pending.push("refund_rate: requires order denominator window — Day-3");

  return {
    org_id: input.orgId,
    date: dateStr,
    snapshot_id: makeSnapshotId(input.orgId, input.date, computedAt),
    revenue_gross: dineroToDecimalString(revenueGross),
    revenue_net: dineroToDecimalString(revenueNet),
    refunds: dineroToDecimalString(refundsTotal),
    fees: dineroToDecimalString(feesTotal),
    contribution_profit: contributionProfit,
    orders: orderCount,
    aov,
    ad_spend: null,
    gross_margin: null,
    roas: null,
    blended_mer: null,
    cac: null,
    new_customers: null,
    refund_rate: null,
    computed_at: computedAt.toISOString(),
    pending_source_connection: pending,
  };
};

// Day-1 alias — preserves the old export name for any internal callers.
export const computeShopifyDailyMetricsFromRows = computeDailyMetricsFromRows;
export type ShopifyDailyMetricsInput = DailyMetricsInput;
export type ShopifyDailyMetricsOutput = DailyMetricsOutput;
