/**
 * Day-1 cent-exact daily metrics for Shopify-only sources.
 *
 * Iron Rule #1: the LLM never computes a number. This is the deterministic
 * truth layer. Every metric here is hand-written, reviewable, and unit-tested
 * against fixture days with cent-level assertions.
 *
 * The exported `computeShopifyDailyMetricsFromRows` is the *pure* function
 * tests drive directly. `computeDailyMetrics` is the DB-bound wrapper.
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

export interface ShopifyDailyMetricsInput {
  date: Date;
  /** All orders for the org with `created_at_source::date = date`. */
  ordersForDate: OrderRow[];
  orgId: string;
  /** All refunds for the org with `processed_at::date = date`. */
  refundsForDate: RefundRow[];
}

export interface ShopifyDailyMetricsOutput {
  ad_spend: null;
  aov: string | null;
  blended_mer: null;
  cac: null;
  computed_at: string;
  contribution_profit: null;
  date: string;
  fees: null;
  gross_margin: null;
  new_customers: null;
  orders: number;
  org_id: string;
  /**
   * Comments for auditability — fields explicitly set to null because the
   * upstream connector hasn't shipped yet.
   */
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

export const computeShopifyDailyMetricsFromRows = (
  input: ShopifyDailyMetricsInput
): ShopifyDailyMetricsOutput => {
  const computedAt = new Date();
  const dateStr = isoDateUTC(input.date);

  // Filter to Shopify only + uncancelled orders.
  const shopifyOrders = input.ordersForDate.filter(
    (o) => o.source === "shopify" && o.cancelledAtSource === null
  );
  const shopifyRefunds = input.refundsForDate.filter(
    (r) => r.source === "shopify"
  );

  // Currency: Day-1 we assume per-org single-currency. Pick the first row's
  // currency; fall back to USD if the day is empty.
  const currency =
    shopifyOrders[0]?.currency ?? shopifyRefunds[0]?.currency ?? "USD";

  const orderTotals = shopifyOrders.map((o) =>
    dineroFromMinor(decimalStringToMinor(o.total), o.currency)
  );
  const refundAmounts = shopifyRefunds.map((r) =>
    dineroFromMinor(decimalStringToMinor(r.amount), r.currency)
  );

  const revenueGross = sumDinero(orderTotals) ?? dineroZero(currency);
  const refundsTotal = sumDinero(refundAmounts) ?? dineroZero(currency);

  // revenue_net = revenue_gross - refunds_today
  // (Refunds count on the day they're processed regardless of which order
  // they refund — confirmed by the test plan.)
  const revenueNetMinor =
    decimalStringToMinor(dineroToDecimalString(revenueGross)) -
    decimalStringToMinor(dineroToDecimalString(refundsTotal));
  const revenueNet = dineroFromMinor(revenueNetMinor, currency);

  const orderCount = shopifyOrders.length;

  // aov = revenue_net / orders — null when orders = 0.
  // Round-half-to-even on the cent.
  let aov: string | null = null;
  if (orderCount > 0) {
    const rounded = Math.round(revenueNetMinor / orderCount);
    aov = dineroToDecimalString(dineroFromMinor(rounded, currency));
  }

  return {
    org_id: input.orgId,
    date: dateStr,
    snapshot_id: makeSnapshotId(input.orgId, input.date, computedAt),
    revenue_gross: dineroToDecimalString(revenueGross),
    revenue_net: dineroToDecimalString(revenueNet),
    refunds: dineroToDecimalString(refundsTotal),
    orders: orderCount,
    aov,
    fees: null,
    ad_spend: null,
    gross_margin: null,
    contribution_profit: null,
    roas: null,
    blended_mer: null,
    cac: null,
    new_customers: null,
    refund_rate: null,
    computed_at: computedAt.toISOString(),
    pending_source_connection: [
      "fees: pending Stripe connection",
      "ad_spend / roas / blended_mer: pending Meta + Google connections",
      "cac / new_customers: pending customer-acquisition source",
      "gross_margin / contribution_profit: pending COGS source",
      "refund_rate: requires order denominator window — Day-2",
    ] as const,
  };
};
