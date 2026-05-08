/**
 * Synthesize Stripe payments / refunds / payouts that mirror the orders
 * produced by `synthesize-orders`. Two deliberate drifts are baked in:
 *
 * 1. ORDER_MISSING_PAYMENT — N orders in the trailing window have no
 *    matching Stripe payment, so reconcile fires `ORDER_MISSING_PAYMENT`.
 * 2. STRIPE_PAYOUT_GAP — one weekly payout's expected_arrival_at is
 *    shifted N business days, so reconcile fires `PAYOUT_GAP`.
 */

import type { Rng } from "./rng";
import type { AnomalyDef, Scenario } from "./scenario-maeve";
import type { SyntheticOrder } from "./synthesize-orders";

export interface SyntheticPayment {
  currency: string;
  feeMinor: number;
  grossMinor: number;
  netMinor: number;
  processedAt: Date;
  /** orderId we link to (caller resolves to UUID at insert time). */
  sourceOrderRef: string;
  sourcePaymentId: string;
  status: "succeeded";
}

export interface SyntheticRefund {
  amountMinor: number;
  currency: string;
  processedAt: Date;
  reason: string;
  sourceOrderRef: string;
  sourcePaymentRef: string;
  sourceRefundId: string;
}

export interface SyntheticPayout {
  arrivedAt: Date | null;
  currency: string;
  expectedArrivalAt: Date;
  feeMinor: number;
  grossMinor: number;
  netMinor: number;
  periodEnd: Date;
  periodStart: Date;
  sourcePayoutId: string;
  status: "paid";
}

export interface SyntheticStripe {
  payments: SyntheticPayment[];
  payouts: SyntheticPayout[];
  refunds: SyntheticRefund[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const stripeFeeMinor = (grossMinor: number): number =>
  Math.round(grossMinor * 0.029) + 30;

const dayOffsetFromEnd = (day: Date, end: Date): number =>
  Math.round((day.getTime() - end.getTime()) / ONE_DAY_MS);

const findAnomaly = (
  scenario: Scenario,
  kind: AnomalyDef["kind"]
): AnomalyDef | null => scenario.anomalies.find((a) => a.kind === kind) ?? null;

const inAnomalyWindow = (daysAgo: number, a: AnomalyDef): boolean =>
  daysAgo <= a.daysAgoStart && daysAgo >= a.daysAgoEnd;

const addBusinessDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  let added = 0;
  while (added < n) {
    out.setUTCDate(out.getUTCDate() + 1);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return out;
};

interface ContextForStripe {
  end: Date;
  scenario: Scenario;
}

const pickMissingPaymentOrders = (
  orders: SyntheticOrder[],
  scenario: Scenario,
  end: Date
): Set<string> => {
  const anomaly = findAnomaly(scenario, "ORDER_MISSING_PAYMENT");
  if (!anomaly) {
    return new Set();
  }
  const target = anomaly.params.orderCount ?? 0;
  if (target <= 0) {
    return new Set();
  }
  // Trailing window orders eligible for the gap, sorted by created time.
  const eligible = orders
    .filter((o) => o.financialStatus === "paid" && o.cancelledAtSource === null)
    .filter((o) => {
      const daysAgo = dayOffsetFromEnd(startOfUtcDay(o.createdAtSource), end);
      return inAnomalyWindow(daysAgo, anomaly);
    })
    .sort((a, b) => a.createdAtSource.getTime() - b.createdAtSource.getTime());

  const selected = new Set<string>();
  // Pick `target` orders evenly spaced across the eligible set so the gap
  // distributes naturally rather than clustering on one minute.
  const stride = Math.max(1, Math.floor(eligible.length / Math.max(target, 1)));
  for (
    let i = 0, picked = 0;
    i < eligible.length && picked < target;
    i += stride, picked++
  ) {
    const order = eligible[i];
    if (order) {
      selected.add(order.sourceOrderId);
    }
  }
  return selected;
};

const synthesizePayments = (
  orders: SyntheticOrder[],
  ctx: ContextForStripe
): { payments: SyntheticPayment[]; missingSet: Set<string> } => {
  const missingSet = pickMissingPaymentOrders(orders, ctx.scenario, ctx.end);
  const payments: SyntheticPayment[] = [];
  for (const o of orders) {
    if (o.financialStatus !== "paid") {
      continue;
    }
    if (o.cancelledAtSource !== null) {
      continue;
    }
    if (missingSet.has(o.sourceOrderId)) {
      continue;
    }
    const grossMinor = o.totalMinor;
    const feeMinor = stripeFeeMinor(grossMinor);
    payments.push({
      sourcePaymentId: `pi_demo_${o.sourceOrderId.split("/").pop()}`,
      sourceOrderRef: o.sourceOrderId,
      grossMinor,
      feeMinor,
      netMinor: grossMinor - feeMinor,
      currency: o.currency,
      status: "succeeded",
      processedAt: new Date(o.createdAtSource.getTime() + 60 * 1000),
    });
  }
  return { payments, missingSet };
};

const synthesizeRefunds = (
  orders: SyntheticOrder[],
  payments: SyntheticPayment[],
  rng: Rng
): SyntheticRefund[] => {
  const paymentByOrder = new Map(payments.map((p) => [p.sourceOrderRef, p]));
  const refunds: SyntheticRefund[] = [];
  for (const o of orders) {
    if (o.financialStatus !== "refunded") {
      continue;
    }
    const payment = paymentByOrder.get(o.sourceOrderId);
    if (!payment) {
      continue;
    }
    const partial = rng.nextBool(0.4);
    const amountMinor = partial
      ? Math.round(o.totalMinor * (rng.nextFloat() * 0.5 + 0.2))
      : o.totalMinor;
    const processedAt = new Date(
      o.createdAtSource.getTime() + rng.nextInt(1, 14) * ONE_DAY_MS
    );
    refunds.push({
      sourceRefundId: `re_demo_${o.sourceOrderId.split("/").pop()}`,
      sourcePaymentRef: payment.sourcePaymentId,
      sourceOrderRef: o.sourceOrderId,
      amountMinor,
      currency: o.currency,
      reason: rng.nextChoice([
        "customer_request",
        "defective",
        "duplicate",
      ] as const),
      processedAt,
    });
  }
  return refunds;
};

const synthesizePayouts = (
  payments: SyntheticPayment[],
  ctx: ContextForStripe,
  rng: Rng
): SyntheticPayout[] => {
  const payoutGapAnomaly = findAnomaly(ctx.scenario, "STRIPE_PAYOUT_GAP");
  if (payments.length === 0) {
    return [];
  }
  const sortedPayments = [...payments].sort(
    (a, b) => a.processedAt.getTime() - b.processedAt.getTime()
  );

  const earliest = startOfUtcDay(sortedPayments[0]?.processedAt ?? ctx.end);
  const latest = startOfUtcDay(sortedPayments.at(-1)?.processedAt ?? ctx.end);
  // Find the first Sunday on/after `earliest` so payouts run weekly Mon→Sun.
  const periodEnd = new Date(earliest);
  while (periodEnd.getUTCDay() !== 0) {
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  }

  const payouts: SyntheticPayout[] = [];
  let periodEndCursor = periodEnd;
  while (periodEndCursor.getTime() <= latest.getTime()) {
    const periodStart = new Date(periodEndCursor.getTime() - 6 * ONE_DAY_MS);
    const inWindowPayments = sortedPayments.filter((p) => {
      const t = p.processedAt.getTime();
      return (
        t >= periodStart.getTime() &&
        t <= periodEndCursor.getTime() + ONE_DAY_MS - 1
      );
    });
    if (inWindowPayments.length > 0) {
      const grossMinor = inWindowPayments.reduce((s, p) => s + p.grossMinor, 0);
      const feeMinor = inWindowPayments.reduce((s, p) => s + p.feeMinor, 0);
      const expectedArrival = addBusinessDays(periodEndCursor, 2);
      const daysAgoForPeriod = dayOffsetFromEnd(periodEndCursor, ctx.end);
      const isGap =
        payoutGapAnomaly !== null &&
        inAnomalyWindow(daysAgoForPeriod, payoutGapAnomaly);
      const delayDays = isGap
        ? Math.round(payoutGapAnomaly?.params.delayDays ?? 0)
        : 0;
      const finalExpected = isGap
        ? addBusinessDays(expectedArrival, delayDays)
        : expectedArrival;
      const today = ctx.end;
      const arrived =
        finalExpected.getTime() <= today.getTime() ? finalExpected : null;

      payouts.push({
        sourcePayoutId: `po_demo_${periodStart.toISOString().slice(0, 10)}`,
        grossMinor,
        feeMinor,
        netMinor: grossMinor - feeMinor,
        currency: ctx.scenario.currency,
        status: "paid",
        periodStart,
        periodEnd: periodEndCursor,
        expectedArrivalAt: finalExpected,
        arrivedAt: arrived,
      });
      // Touch rng once so payout generation participates in determinism even
      // when no other branch needs entropy this iteration.
      rng.nextFloat();
    }
    const next = new Date(periodEndCursor);
    next.setUTCDate(next.getUTCDate() + 7);
    periodEndCursor = next;
  }

  return payouts;
};

export const synthesizeStripeForOrders = (
  orders: SyntheticOrder[],
  scenario: Scenario,
  rng: Rng,
  windowEnd: Date
): SyntheticStripe => {
  const ctx: ContextForStripe = { end: startOfUtcDay(windowEnd), scenario };
  const { payments } = synthesizePayments(orders, ctx);
  const refunds = synthesizeRefunds(orders, payments, rng);
  const payouts = synthesizePayouts(payments, ctx, rng);
  return { payments, refunds, payouts };
};
