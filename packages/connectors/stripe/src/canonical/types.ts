/**
 * Canonical normalized event shapes the Stripe connector emits. These map
 * 1:1 onto the source-agnostic tables in @ai-cfo/database (payments,
 * refunds, payouts). Universal-extensibility (Iron Rule #10): same shapes
 * Shopify emits.
 */

export interface NormalizedStripePayment {
  currency: string;
  feeAmountMinor: number;
  grossAmountMinor: number;
  kind: "payment";
  netAmountMinor: number;
  orgId: string;
  payoutSourceId: string | null;
  processedAt: Date | null;
  source: "stripe";
  sourceMetadata: Record<string, unknown>;
  /** Stripe charges may carry a `metadata.shopify_order_id` we can lift; if
   *  absent the reconciliation matcher will pair on amount + timestamp. */
  sourceOrderId: string | null;
  sourcePaymentId: string;
  status: string;
}

export interface NormalizedStripeRefund {
  amountMinor: number;
  currency: string;
  kind: "refund";
  orgId: string;
  processedAt: Date;
  reason: string | null;
  source: "stripe";
  sourceMetadata: Record<string, unknown>;
  /** Order id, if recoverable from charge.metadata; else null. */
  sourceOrderId: string | null;
  /** Charge id this refund is against; the normalize job links to the local
   *  payment row by (org_id, source='stripe', source_payment_id). */
  sourcePaymentId: string;
  sourceRefundId: string;
}

export interface NormalizedStripePayout {
  arrivedAt: Date | null;
  currency: string;
  expectedArrivalAt: Date | null;
  feeAmountMinor: number;
  grossAmountMinor: number;
  kind: "payout";
  netAmountMinor: number;
  orgId: string;
  periodEnd: Date | null;
  periodStart: Date | null;
  source: "stripe";
  sourceMetadata: Record<string, unknown>;
  sourcePayoutId: string;
  status: string;
}

export type NormalizedStripeEvent =
  | NormalizedStripePayment
  | NormalizedStripeRefund
  | NormalizedStripePayout;

export const STRIPE_WEBHOOK_TOPICS = [
  "charge.succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "payout.created",
  "payout.paid",
  "payout.failed",
] as const;

export type StripeWebhookTopic = (typeof STRIPE_WEBHOOK_TOPICS)[number];
