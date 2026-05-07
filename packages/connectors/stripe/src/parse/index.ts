import type {
  NormalizedStripeEvent,
  NormalizedStripePayment,
  NormalizedStripePayout,
  NormalizedStripeRefund,
  StripeWebhookTopic,
} from "../canonical/types";
import {
  type StripeCharge,
  stripeChargeSchema,
  stripeDisputeSchema,
  stripeEventSchema,
  stripePayoutSchema,
} from "./schemas";

export interface ParseContext {
  orgId: string;
  /** A `Stripe.Event` (or wire-level equivalent), already verified. */
  rawEvent: unknown;
}

const epochSecondsToDate = (s: number): Date => new Date(s * 1000);

const orderIdFromMetadata = (md: Record<string, string>): string | null =>
  md.shopify_order_id ?? md.order_id ?? md.shopify_order_number ?? null;

const chargeToPayment = (
  charge: StripeCharge,
  orgId: string
): NormalizedStripePayment => {
  // Pull fee + net from balance_transaction. If only the id is set (not
  // expanded), fee and net are unknown until a backfill pass with
  // expand=balance_transaction or a separate API lookup.
  const bt =
    typeof charge.balance_transaction === "object" &&
    charge.balance_transaction !== null
      ? charge.balance_transaction
      : null;
  const feeAmountMinor = bt?.fee ?? 0;
  const netAmountMinor = bt?.net ?? charge.amount;

  return {
    kind: "payment",
    source: "stripe",
    orgId,
    sourcePaymentId: charge.id,
    sourceOrderId: orderIdFromMetadata(charge.metadata),
    grossAmountMinor: charge.amount,
    feeAmountMinor,
    netAmountMinor,
    currency: charge.currency.toUpperCase(),
    status: charge.status,
    processedAt: epochSecondsToDate(charge.created),
    payoutSourceId: null,
    sourceMetadata: { raw: charge },
  };
};

const refundsFromCharge = (
  charge: StripeCharge,
  orgId: string
): NormalizedStripeRefund[] => {
  const refunds = charge.refunds?.data ?? [];
  return refunds.map((r) => ({
    kind: "refund",
    source: "stripe",
    orgId,
    sourceRefundId: r.id,
    sourcePaymentId: charge.id,
    sourceOrderId: orderIdFromMetadata(charge.metadata),
    amountMinor: r.amount,
    currency: r.currency.toUpperCase(),
    reason: r.reason ?? null,
    processedAt: epochSecondsToDate(r.created),
    sourceMetadata: { raw: r },
  }));
};

const payoutToNormalized = (
  payout: ReturnType<typeof stripePayoutSchema.parse>,
  orgId: string
): NormalizedStripePayout => ({
  kind: "payout",
  source: "stripe",
  orgId,
  sourcePayoutId: payout.id,
  // Stripe payouts are reported net of fees; gross/net are the same number,
  // and any per-transaction fees were already debited inside the payout's
  // balance transactions. We'll reconcile fees against `payments.fee_amount`
  // separately. Day-2 accepts net=gross; Day-3 will fan in the
  // payout-vs-fee reconciliation.
  grossAmountMinor: payout.amount,
  feeAmountMinor: 0,
  netAmountMinor: payout.amount,
  currency: payout.currency.toUpperCase(),
  status: payout.status,
  periodStart: null,
  periodEnd: null,
  expectedArrivalAt: payout.arrival_date
    ? epochSecondsToDate(payout.arrival_date)
    : null,
  arrivedAt: payout.status === "paid" ? new Date() : null,
  sourceMetadata: { raw: payout },
});

export const parseStripeEvent = (
  ctx: ParseContext
): NormalizedStripeEvent[] => {
  const event = stripeEventSchema.parse(ctx.rawEvent);
  const obj = event.data.object;

  switch (event.type as StripeWebhookTopic | string) {
    case "charge.succeeded": {
      const charge = stripeChargeSchema.parse(obj);
      return [chargeToPayment(charge, ctx.orgId)];
    }
    case "charge.refunded": {
      const charge = stripeChargeSchema.parse(obj);
      // Emit the refunded payment (so net_amount/fee can update) AND the
      // refund row(s).
      return [
        chargeToPayment(charge, ctx.orgId),
        ...refundsFromCharge(charge, ctx.orgId),
      ];
    }
    case "charge.dispute.created": {
      // Day-2: log only. Returns no canonical events; the normalize job
      // logs the dispute id for follow-up. Day-3 adds a `disputes` table
      // and emits a kind: "dispute" canonical event.
      stripeDisputeSchema.parse(obj);
      return [];
    }
    case "payout.created":
    case "payout.paid":
    case "payout.failed": {
      const payout = stripePayoutSchema.parse(obj);
      return [payoutToNormalized(payout, ctx.orgId)];
    }
    default:
      return [];
  }
};
