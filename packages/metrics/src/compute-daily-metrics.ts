/**
 * Day-2/3/5 cent-exact daily metrics. Source-agnostic by design (iron rule #10).
 *
 * Iron Rule #1: the LLM never computes a number. This is the deterministic
 * truth layer. Every metric here is hand-written, reviewable, and unit-tested
 * against fixture days with cent-level assertions.
 *
 * Day-5 additions:
 *   - `ad_spend` — cross-source sum of ad_metrics_daily.spend (Meta + Google + ...).
 *   - `roas` — revenue_gross / ad_spend. null when ad_spend = 0.
 *   - `blended_mer` — same formula as `roas`; alias kept for operator vocabulary.
 *   - `cac` — ad_spend / new_customers. null when new_customers = 0.
 *   - `new_customers` — distinct count of customer_email on this day's
 *     orders that has NEVER appeared on any prior order for the same org.
 *     Computed against a `priorCustomerEmails` Set passed in by the caller
 *     (the DB wrapper builds it once via a single SELECT).
 *   - `refund_rate` — refunds_today / revenue_gross. null when revenue_gross = 0.
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
  customerEmail?: string | null;
  source: string;
  total: string;
}

/**
 * One row from public.ad_metrics_daily for the date. Source-agnostic; the
 * function sums across all sources (Meta, Google, …) and currencies (best
 * effort: a multi-currency day will always be summed in the dominant
 * currency, callers handle FX upstream).
 */
export interface AdMetricRow {
  conversions: string;
  conversionValue: string;
  currency: string;
  source: string;
  spend: string;
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
  /** Day-5: ad_metrics_daily rows for the date, any source. Optional so
   *  legacy callers stay literal; defaults to []. */
  adMetricsForDate?: AdMetricRow[];
  date: Date;
  /** Shopify orders with `created_at_source::date = date`. */
  ordersForDate: OrderRow[];
  orgId: string;
  /** Stripe payments (status='succeeded') with `processed_at::date = date`.
   *  Optional so Day-1 Shopify-only tests stay literal; defaults to []. */
  paymentsForDate?: PaymentRow[];
  /** Day-5: set of customer_email values that placed an order BEFORE the
   *  start of `date` (any source). Used to detect first-time buyers.
   *  Empty/omitted means every email today is a first-time buyer. */
  priorCustomerEmails?: ReadonlySet<string>;
  /** Refunds with `processed_at::date = date`, any source. */
  refundsForDate: RefundRow[];
}

export interface DailyMetricsOutput {
  ad_spend: string;
  aov: string | null;
  blended_mer: string | null;
  cac: string | null;
  computed_at: string;
  contribution_profit: string | null;
  date: string;
  fees: string;
  gross_margin: null;
  new_customers: number;
  orders: number;
  org_id: string;
  pending_source_connection: readonly string[];
  refund_rate: string | null;
  refunds: string;
  revenue_gross: string;
  revenue_net: string;
  roas: string | null;
  snapshot_id: string;
}

const isoDateUTC = (d: Date): string => format(d, "yyyy-MM-dd");

const makeSnapshotId = (orgId: string, date: Date, computedAt: Date): string =>
  `${orgId}-${isoDateUTC(date)}-${computedAt.toISOString()}`;

const minorString = (s: string): number => decimalStringToMinor(s);

interface Day5Result {
  adSpend: ReturnType<typeof dineroFromMinor>;
  adSpendMinor: number;
  blendedMer: string | null;
  cac: string | null;
  newCustomers: number;
  refundRate: string | null;
  roas: string | null;
}

const detectNewCustomers = (
  shopifyOrders: readonly OrderRow[],
  priorEmails: ReadonlySet<string>
): number => {
  const todays = new Set<string>();
  for (const o of shopifyOrders) {
    const email = o.customerEmail;
    if (typeof email !== "string" || email.length === 0) {
      continue;
    }
    if (!priorEmails.has(email)) {
      todays.add(email);
    }
  }
  return todays.size;
};

const computeDay5Metrics = (args: {
  adRows: readonly AdMetricRow[];
  shopifyOrders: readonly OrderRow[];
  priorEmails: ReadonlySet<string>;
  grossMinor: number;
  refundsMinor: number;
  currency: string;
}): Day5Result => {
  const adSpendMinor = args.adRows
    .map((r) => minorString(r.spend))
    .reduce((a, b) => a + b, 0);
  const adSpend = dineroFromMinor(adSpendMinor, args.currency);
  const newCustomers = detectNewCustomers(args.shopifyOrders, args.priorEmails);

  const roas =
    adSpendMinor > 0 && args.grossMinor >= 0
      ? (args.grossMinor / adSpendMinor).toFixed(4)
      : null;
  const blendedMer = roas;
  const cac =
    adSpendMinor > 0 && newCustomers > 0
      ? dineroToDecimalString(
          dineroFromMinor(
            Math.round(adSpendMinor / newCustomers),
            args.currency
          )
        )
      : null;
  const refundRate =
    args.grossMinor > 0
      ? (args.refundsMinor / args.grossMinor).toFixed(6)
      : null;
  return {
    adSpend,
    adSpendMinor,
    newCustomers,
    roas,
    blendedMer,
    cac,
    refundRate,
  };
};

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

  const day5 = computeDay5Metrics({
    adRows: input.adMetricsForDate ?? [],
    shopifyOrders,
    priorEmails: input.priorCustomerEmails ?? new Set<string>(),
    grossMinor,
    refundsMinor,
    currency,
  });
  const {
    adSpend,
    adSpendMinor,
    newCustomers,
    roas,
    blendedMer,
    cac,
    refundRate,
  } = day5;

  // contribution_profit = revenue_net − ad_spend − COGS_stub. COGS still 0
  // until a COGS source connects (audit string surfaces the assumption).
  const COGS_STUB_MINOR = 0;
  const contributionProfitMinor =
    revenueNetMinor - adSpendMinor - COGS_STUB_MINOR;
  const contributionProfit = dineroToDecimalString(
    dineroFromMinor(contributionProfitMinor, currency)
  );

  const pending: string[] = [];
  if (stripePayments.length === 0) {
    pending.push("fees: pending Stripe payments for this day");
  }
  if (adSpendMinor === 0) {
    pending.push(
      "ad_spend / roas / blended_mer: ad_spend_zero — connect Meta and/or Google to populate"
    );
  }
  if (newCustomers === 0) {
    pending.push(
      "cac / new_customers: zero new customers today (or no Shopify orders)"
    );
  }
  pending.push(
    "gross_margin / contribution_profit: pending COGS source (currently uses COGS=0 stub)"
  );

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
    ad_spend: dineroToDecimalString(adSpend),
    gross_margin: null,
    roas,
    blended_mer: blendedMer,
    cac,
    new_customers: newCustomers,
    refund_rate: refundRate,
    computed_at: computedAt.toISOString(),
    pending_source_connection: pending,
  };
};

// Day-1 alias — preserves the old export name for any internal callers.
export const computeShopifyDailyMetricsFromRows = computeDailyMetricsFromRows;
export type ShopifyDailyMetricsInput = DailyMetricsInput;
export type ShopifyDailyMetricsOutput = DailyMetricsOutput;
