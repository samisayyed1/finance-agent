/**
 * Canonical normalized event shapes the Shopify connector emits. These map
 * 1:1 onto the source-agnostic tables in @ai-cfo/database (orders,
 * order_line_items, payments, refunds). Universal-extensibility (Iron Rule
 * #10): Stripe / Meta / Google / etc. emit the same shapes. Vendor-specific
 * fields ride in `sourceMetadata`.
 */

export interface NormalizedOrder {
  cancelledAtSource: Date | null;
  createdAtSource: Date;
  currency: string;
  customerEmail: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  kind: "order";
  lineItems: NormalizedOrderLineItem[];
  orderNumber: string | null;
  orgId: string;
  source: "shopify";
  sourceMetadata: Record<string, unknown>;
  sourceOrderId: string;
  /** All money values are minor-units (cents) integers. Conversion to
   *  numeric(14,2) happens at the DB boundary in the normalize job. */
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalMinor: number;
  totalShippingMinor: number;
  totalTaxMinor: number;
}

export interface NormalizedOrderLineItem {
  productId: string | null;
  quantity: number;
  sku: string | null;
  source: "shopify";
  sourceLineItemId: string;
  sourceMetadata: Record<string, unknown>;
  taxAmountMinor: number;
  title: string | null;
  totalDiscountMinor: number;
  unitPriceMinor: number;
}

export interface NormalizedPayment {
  currency: string;
  feeAmountMinor: number;
  grossAmountMinor: number;
  kind: "payment";
  netAmountMinor: number;
  orgId: string;
  processedAt: Date | null;
  source: "shopify";
  sourceMetadata: Record<string, unknown>;
  /** Reference back to the canonical order via its source_order_id. The
   *  normalize job resolves this to the local UUID at upsert time. */
  sourceOrderId: string;
  sourcePaymentId: string;
  status: string | null;
}

export interface NormalizedRefund {
  amountMinor: number;
  currency: string;
  kind: "refund";
  orgId: string;
  processedAt: Date;
  reason: string | null;
  source: "shopify";
  sourceMetadata: Record<string, unknown>;
  sourceOrderId: string;
  sourceRefundId: string;
}

export type NormalizedEvent =
  | NormalizedOrder
  | NormalizedPayment
  | NormalizedRefund;

/** Shopify webhook topics this connector consumes. */
export const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/updated",
  "orders/cancelled",
  "refunds/create",
  "app/uninstalled",
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];
