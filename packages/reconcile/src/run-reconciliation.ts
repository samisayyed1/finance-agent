import {
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

  return {
    ordersConsidered: orderRows.length,
    paymentsConsidered: paymentRows.length,
    matched: result.matched.length,
    orderMissingPayment: result.orphanedOrders.length,
    paymentWithoutOrder: result.orphanedPayments.length,
    feeDriftFlags,
  };
};
