import type {
  NormalizedStripeEvent,
  NormalizedStripePayment,
  NormalizedStripePayout,
  NormalizedStripeRefund,
} from "@ai-cfo/connector-stripe";
import {
  and,
  database,
  eq,
  orders,
  payments,
  payouts,
  refunds,
} from "@ai-cfo/database";

/**
 * Apply a batch of Stripe NormalizedEvents to canonical tables. Idempotent.
 * Mirrors the Shopify applier's design — separately exported pure-ish
 * function so tests can drive it without the Trigger.dev runtime.
 */

export interface StripeApplyResult {
  affectedDates: string[];
  paymentsUpserted: number;
  payoutsUpserted: number;
  refundsUpserted: number;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const minorToDecimal = (minor: number): string => {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
};

const resolveOrderId = async (
  orgId: string,
  source: string,
  sourceOrderId: string
): Promise<string | null> => {
  const rows = await database
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.orgId, orgId),
        eq(orders.source, source),
        eq(orders.sourceOrderId, sourceOrderId)
      )
    )
    .limit(1);
  return rows[0]?.id ?? null;
};

const resolveStripePaymentId = async (
  orgId: string,
  sourcePaymentId: string
): Promise<string | null> => {
  const rows = await database
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.orgId, orgId),
        eq(payments.source, "stripe"),
        eq(payments.sourcePaymentId, sourcePaymentId)
      )
    )
    .limit(1);
  return rows[0]?.id ?? null;
};

const upsertPayment = async (
  e: NormalizedStripePayment,
  orgId: string
): Promise<void> => {
  // Try to link to a Shopify order (by source_order_id metadata) — Day-1
  // orders are source='shopify', not 'stripe'. We don't write order_id when
  // we can't link.
  const orderId = e.sourceOrderId
    ? await resolveOrderId(orgId, "shopify", e.sourceOrderId)
    : null;

  await database
    .insert(payments)
    .values({
      orgId,
      source: "stripe",
      sourcePaymentId: e.sourcePaymentId,
      orderId,
      grossAmount: minorToDecimal(e.grossAmountMinor),
      feeAmount: minorToDecimal(e.feeAmountMinor),
      netAmount: minorToDecimal(e.netAmountMinor),
      currency: e.currency,
      status: e.status,
      processedAt: e.processedAt,
      sourceMetadata: e.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [payments.orgId, payments.source, payments.sourcePaymentId],
      set: {
        orderId,
        grossAmount: minorToDecimal(e.grossAmountMinor),
        feeAmount: minorToDecimal(e.feeAmountMinor),
        netAmount: minorToDecimal(e.netAmountMinor),
        currency: e.currency,
        status: e.status,
        processedAt: e.processedAt,
        sourceMetadata: e.sourceMetadata,
      },
    });
};

const upsertRefund = async (
  e: NormalizedStripeRefund,
  orgId: string
): Promise<void> => {
  const paymentId = await resolveStripePaymentId(orgId, e.sourcePaymentId);
  const orderId = e.sourceOrderId
    ? await resolveOrderId(orgId, "shopify", e.sourceOrderId)
    : null;

  await database
    .insert(refunds)
    .values({
      orgId,
      source: "stripe",
      sourceRefundId: e.sourceRefundId,
      orderId,
      paymentId,
      amount: minorToDecimal(e.amountMinor),
      currency: e.currency,
      reason: e.reason,
      processedAt: e.processedAt,
      sourceMetadata: e.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [refunds.orgId, refunds.source, refunds.sourceRefundId],
      set: {
        paymentId,
        orderId,
        amount: minorToDecimal(e.amountMinor),
        currency: e.currency,
        reason: e.reason,
        processedAt: e.processedAt,
        sourceMetadata: e.sourceMetadata,
      },
    });
};

const upsertPayout = async (
  e: NormalizedStripePayout,
  orgId: string
): Promise<void> => {
  await database
    .insert(payouts)
    .values({
      orgId,
      source: "stripe",
      sourcePayoutId: e.sourcePayoutId,
      grossAmount: minorToDecimal(e.grossAmountMinor),
      feeAmount: minorToDecimal(e.feeAmountMinor),
      netAmount: minorToDecimal(e.netAmountMinor),
      currency: e.currency,
      status: e.status,
      periodStart: e.periodStart ? isoDate(e.periodStart) : null,
      periodEnd: e.periodEnd ? isoDate(e.periodEnd) : null,
      expectedArrivalAt: e.expectedArrivalAt,
      arrivedAt: e.arrivedAt,
      sourceMetadata: e.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [payouts.orgId, payouts.source, payouts.sourcePayoutId],
      set: {
        grossAmount: minorToDecimal(e.grossAmountMinor),
        feeAmount: minorToDecimal(e.feeAmountMinor),
        netAmount: minorToDecimal(e.netAmountMinor),
        currency: e.currency,
        status: e.status,
        periodStart: e.periodStart ? isoDate(e.periodStart) : null,
        periodEnd: e.periodEnd ? isoDate(e.periodEnd) : null,
        expectedArrivalAt: e.expectedArrivalAt,
        arrivedAt: e.arrivedAt,
        sourceMetadata: e.sourceMetadata,
      },
    });
};

export const applyStripeEvents = async (
  events: NormalizedStripeEvent[],
  orgId: string
): Promise<StripeApplyResult> => {
  const result: StripeApplyResult = {
    paymentsUpserted: 0,
    refundsUpserted: 0,
    payoutsUpserted: 0,
    affectedDates: [],
  };
  const dates = new Set<string>();

  for (const event of events) {
    if (event.kind === "payment") {
      await upsertPayment(event, orgId);
      result.paymentsUpserted += 1;
      if (event.processedAt) {
        dates.add(isoDate(event.processedAt));
      }
      continue;
    }
    if (event.kind === "refund") {
      await upsertRefund(event, orgId);
      result.refundsUpserted += 1;
      dates.add(isoDate(event.processedAt));
      continue;
    }
    if (event.kind === "payout") {
      await upsertPayout(event, orgId);
      result.payoutsUpserted += 1;
      if (event.expectedArrivalAt) {
        dates.add(isoDate(event.expectedArrivalAt));
      }
    }
  }

  result.affectedDates = Array.from(dates).sort();
  return result;
};
