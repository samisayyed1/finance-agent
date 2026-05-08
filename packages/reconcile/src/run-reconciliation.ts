import {
  adMetricsDaily,
  and,
  database,
  eq,
  gte,
  lt,
  orders,
  payments,
  reconciliationFlags,
} from "@ai-cfo/database";
import {
  type AdMetricDailySummary,
  type AdSource,
  type AttributionMismatchResult,
  detectAttributionMismatch,
  type OrderForAttribution,
} from "./attribution-match";
import {
  type MatchOptions,
  type MatchOrder,
  type MatchPayment,
  matchOrdersToPayments,
} from "./match";

export interface ReconcileWindow {
  end: Date;
  start: Date;
}

export interface ReconcileResult {
  attributionMismatchFlags: number;
  feeDriftFlags: number;
  matched: number;
  orderMissingPayment: number;
  ordersConsidered: number;
  paymentsConsidered: number;
  paymentWithoutOrder: number;
}

const decimalToMinor = (s: string): number => {
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1) : s;
  const [whole, frac = ""] = abs.split(".");
  const fracPadded = `${frac}00`.slice(0, 2);
  const minor = Number.parseInt(`${whole}${fracPadded}`, 10);
  return negative ? -minor : minor;
};

const minorToDecimal = (minor: number): string => {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
};

export const runReconciliation = async (
  orgId: string,
  window: ReconcileWindow,
  options: MatchOptions = {}
): Promise<ReconcileResult> => {
  // 1. Load Shopify paid orders within window.
  const orderRows = await database
    .select({
      id: orders.id,
      total: orders.total,
      currency: orders.currency,
      createdAtSource: orders.createdAtSource,
    })
    .from(orders)
    .where(
      and(
        eq(orders.orgId, orgId),
        eq(orders.source, "shopify"),
        eq(orders.financialStatus, "paid"),
        gte(orders.createdAtSource, window.start),
        lt(orders.createdAtSource, window.end)
      )
    );

  // 2. Load Stripe succeeded payments within window (slightly widened to
  // catch payments whose processed_at sits just outside the order window).
  const paymentWindowStart = new Date(window.start.getTime() - 30 * 60 * 1000);
  const paymentWindowEnd = new Date(window.end.getTime() + 30 * 60 * 1000);
  const paymentRows = await database
    .select({
      id: payments.id,
      grossAmount: payments.grossAmount,
      feeAmount: payments.feeAmount,
      currency: payments.currency,
      processedAt: payments.processedAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.orgId, orgId),
        eq(payments.source, "stripe"),
        eq(payments.status, "succeeded"),
        gte(payments.processedAt, paymentWindowStart),
        lt(payments.processedAt, paymentWindowEnd)
      )
    );

  const matchOrders: MatchOrder[] = orderRows.map((o) => ({
    id: o.id,
    amountMinor: decimalToMinor(o.total),
    currency: o.currency,
    occurredAt: o.createdAtSource,
  }));
  const matchPayments: MatchPayment[] = paymentRows
    .filter((p) => p.processedAt !== null)
    .map((p) => ({
      id: p.id,
      amountMinor: decimalToMinor(p.grossAmount),
      feeMinor: decimalToMinor(p.feeAmount),
      currency: p.currency,
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      occurredAt: p.processedAt!,
    }));

  const result = matchOrdersToPayments(matchOrders, matchPayments, options);

  // 3. Upsert ORDER_MISSING_PAYMENT for orphaned orders.
  for (const orphanedOrderId of result.orphanedOrders) {
    const order = orderRows.find((o) => o.id === orphanedOrderId);
    if (!order) {
      continue;
    }
    const flagId = `MISSING_PAY_${order.id}`;
    await database
      .insert(reconciliationFlags)
      .values({
        orgId,
        flagId,
        kind: "ORDER_MISSING_PAYMENT",
        orderId: order.id,
        expected: order.total,
        actual: "0.00",
        delta: order.total,
        status: "open",
      })
      .onConflictDoNothing({ target: [reconciliationFlags.flagId] });
  }

  // 4. Upsert PAYMENT_WITHOUT_ORDER for orphaned payments.
  for (const orphanedPaymentId of result.orphanedPayments) {
    const pmt = paymentRows.find((p) => p.id === orphanedPaymentId);
    if (!pmt) {
      continue;
    }
    const flagId = `PAY_NO_ORDER_${pmt.id}`;
    await database
      .insert(reconciliationFlags)
      .values({
        orgId,
        flagId,
        kind: "PAYMENT_WITHOUT_ORDER",
        paymentId: pmt.id,
        expected: "0.00",
        actual: pmt.grossAmount,
        delta: minorToDecimal(-decimalToMinor(pmt.grossAmount)),
        status: "open",
      })
      .onConflictDoNothing({ target: [reconciliationFlags.flagId] });
  }

  // 5. FEE_DRIFT for matched pairs where order.total != gross + fee. (Day-3
  // polish: today's flag is only emitted when the difference exceeds the
  // amount tolerance — sub-cent rounding is normal Stripe behaviour.)
  let feeDriftFlags = 0;
  for (const m of result.matched) {
    const order = orderRows.find((o) => o.id === m.orderId);
    const pmt = paymentRows.find((p) => p.id === m.paymentId);
    if (!(order && pmt)) {
      continue;
    }
    const orderMinor = decimalToMinor(order.total);
    const grossMinor = decimalToMinor(pmt.grossAmount);
    const feeMinor = decimalToMinor(pmt.feeAmount);
    const drift = orderMinor - (grossMinor + feeMinor);
    if (Math.abs(drift) > 1) {
      const flagId = `FEE_DRIFT_${order.id}_${pmt.id}`;
      await database
        .insert(reconciliationFlags)
        .values({
          orgId,
          flagId,
          kind: "FEE_DRIFT",
          orderId: order.id,
          paymentId: pmt.id,
          expected: order.total,
          actual: minorToDecimal(grossMinor + feeMinor),
          delta: minorToDecimal(drift),
          status: "open",
        })
        .onConflictDoNothing({ target: [reconciliationFlags.flagId] });
      feeDriftFlags += 1;
    }
  }

  // 6. Day-6: ATTRIBUTION_MISMATCH per (date, ad_source).
  // Iterate dates in the window in 1-day buckets so each calendar day
  // produces at most one flag per ad source.
  const attributionMismatchFlags = await runAttributionPass(orgId, window);

  return {
    ordersConsidered: orderRows.length,
    paymentsConsidered: paymentRows.length,
    matched: result.matched.length,
    orderMissingPayment: result.orphanedOrders.length,
    paymentWithoutOrder: result.orphanedPayments.length,
    feeDriftFlags,
    attributionMismatchFlags,
  };
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const yyyymmdd = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

interface OrderAttributionRow {
  source_metadata: unknown;
}

const inferredFromOrder = (
  row: OrderAttributionRow
): OrderForAttribution["inferredMarketingSource"] | null => {
  if (row.source_metadata === null || typeof row.source_metadata !== "object") {
    return null;
  }
  const sm = row.source_metadata as Record<string, unknown>;
  const attr = sm.attribution as
    | { inferred_marketing_source?: string }
    | undefined;
  const v = attr?.inferred_marketing_source;
  if (
    v === "meta" ||
    v === "google" ||
    v === "tiktok" ||
    v === "klaviyo" ||
    v === "organic" ||
    v === "other"
  ) {
    return v;
  }
  return null;
};

const persistAttributionMismatch = async (
  result: AttributionMismatchResult
): Promise<void> => {
  const flagId = `ATTR_${result.adSource}_${yyyymmdd(result.date)}_${result.orgId.slice(0, 8)}`;
  const reportedDecimal = result.reportedConversions.toFixed(2);
  const observedDecimal = result.observedOrders.toFixed(2);
  const deltaDecimal = (
    result.reportedConversions - result.observedOrders
  ).toFixed(2);
  await database
    .insert(reconciliationFlags)
    .values({
      orgId: result.orgId,
      flagId,
      kind: "ATTRIBUTION_MISMATCH",
      expected: reportedDecimal,
      actual: observedDecimal,
      delta: deltaDecimal,
      status: "open",
    })
    .onConflictDoUpdate({
      target: [reconciliationFlags.flagId],
      set: {
        expected: reportedDecimal,
        actual: observedDecimal,
        delta: deltaDecimal,
      },
    });
};

const runAttributionPass = async (
  orgId: string,
  window: ReconcileWindow
): Promise<number> => {
  let count = 0;
  let cursor = startOfUtcDay(window.start);
  const end = startOfUtcDay(window.end);
  // If window is exclusive on end, include end if it equals window.end.
  while (cursor.getTime() <= end.getTime()) {
    const dayStart = cursor;
    const dayEnd = new Date(dayStart.getTime() + ONE_DAY_MS);

    // Orders for this day with inferred attribution.
    const orderRows = await database
      .select({
        sourceMetadata: orders.sourceMetadata,
      })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, orgId),
          eq(orders.source, "shopify"),
          gte(orders.createdAtSource, dayStart),
          lt(orders.createdAtSource, dayEnd)
        )
      );
    const ordersForAttribution: OrderForAttribution[] = [];
    for (const r of orderRows) {
      const inferred = inferredFromOrder({
        source_metadata: r.sourceMetadata,
      });
      if (inferred) {
        ordersForAttribution.push({ inferredMarketingSource: inferred });
      }
    }

    // Ad metrics for this day, summed per source.
    const dateStr = dayStart.toISOString().slice(0, 10);
    const adRows = await database
      .select({
        source: adMetricsDaily.source,
        conversions: adMetricsDaily.conversions,
      })
      .from(adMetricsDaily)
      .where(
        and(eq(adMetricsDaily.orgId, orgId), eq(adMetricsDaily.date, dateStr))
      );
    const adMetrics: AdMetricDailySummary[] = adRows
      .filter(
        (r): r is { source: AdSource; conversions: string } =>
          r.source === "meta" || r.source === "google"
      )
      .map((r) => ({
        source: r.source,
        conversions: Number(r.conversions),
      }));

    if (adMetrics.length > 0 || ordersForAttribution.length > 0) {
      const results = detectAttributionMismatch({
        orgId,
        date: dayStart,
        adMetrics,
        orders: ordersForAttribution,
      });
      for (const r of results) {
        await persistAttributionMismatch(r);
        count++;
      }
    }

    cursor = new Date(cursor.getTime() + ONE_DAY_MS);
  }
  return count;
};
