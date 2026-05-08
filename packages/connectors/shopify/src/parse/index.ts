import type {
  NormalizedEvent,
  NormalizedOrder,
  NormalizedOrderLineItem,
  NormalizedPayment,
  NormalizedRefund,
  ShopifyWebhookTopic,
} from "../canonical/types";
import { extractOrderAttribution } from "./attribution";
import { decimalStringToMinor } from "./money";
import {
  type ShopifyOrder,
  type ShopifyRefund,
  shopifyAppUninstalledSchema,
  shopifyOrderSchema,
  shopifyRefundSchema,
} from "./schemas";

export interface ParseContext {
  orgId: string;
  /** The raw JSON payload (already verified by HMAC at this point). */
  rawPayload: unknown;
  topic: ShopifyWebhookTopic | "backfill.order";
}

// TODO: Shopify webhook payloads contain bigint order/line/refund/transaction
// ids. JSON.parse() loses precision for values > Number.MAX_SAFE_INTEGER.
// The webhook ingress route must parse with a bigint-safe JSON parser
// (e.g. `lossless-json`) before calling parseEvent. The Admin GraphQL API
// returns these as strings, so the GraphQL backfill path is safe. Day-2.
const stringId = (id: string | number): string => String(id);

const orderToNormalized = (
  order: ShopifyOrder,
  orgId: string
): NormalizedOrder => {
  const lineItems: NormalizedOrderLineItem[] = order.line_items.map((li) => {
    const taxAmount = (li.tax_lines ?? []).reduce<number>((acc, t) => {
      if (t.price === undefined) {
        return acc;
      }
      return acc + decimalStringToMinor(t.price);
    }, 0);
    return {
      source: "shopify",
      sourceLineItemId: stringId(li.id),
      sku: li.sku ?? null,
      productId: li.product_id != null ? stringId(li.product_id) : null,
      title: li.title ?? null,
      quantity: li.quantity,
      unitPriceMinor: decimalStringToMinor(li.price),
      totalDiscountMinor:
        li.total_discount === undefined
          ? 0
          : decimalStringToMinor(li.total_discount),
      taxAmountMinor: taxAmount,
      sourceMetadata: { raw: li },
    };
  });

  const subtotalMinor =
    order.subtotal_price != null
      ? decimalStringToMinor(order.subtotal_price)
      : lineItems.reduce(
          (s, li) =>
            s + li.unitPriceMinor * li.quantity - li.totalDiscountMinor,
          0
        );

  const shippingMinor = order.total_shipping_price_set
    ? decimalStringToMinor(order.total_shipping_price_set.shop_money.amount)
    : 0;

  return {
    kind: "order",
    source: "shopify",
    orgId,
    sourceOrderId: stringId(order.id),
    orderNumber:
      order.order_number != null
        ? stringId(order.order_number)
        : (order.name ?? null),
    customerEmail: order.email ?? null,
    currency: order.currency,
    subtotalMinor,
    totalTaxMinor:
      order.total_tax != null ? decimalStringToMinor(order.total_tax) : 0,
    totalShippingMinor: shippingMinor,
    totalDiscountMinor:
      order.total_discounts != null
        ? decimalStringToMinor(order.total_discounts)
        : 0,
    totalMinor: decimalStringToMinor(order.total_price),
    financialStatus: order.financial_status ?? null,
    fulfillmentStatus: order.fulfillment_status ?? null,
    createdAtSource: new Date(order.created_at),
    cancelledAtSource: order.cancelled_at ? new Date(order.cancelled_at) : null,
    sourceMetadata: {
      raw: order,
      attribution: extractOrderAttribution(
        order as unknown as {
          landing_site?: string | null;
          referring_site?: string | null;
          source_name?: string | null;
        }
      ),
    },
    lineItems,
  };
};

const orderToPayment = (
  order: ShopifyOrder,
  orgId: string
): NormalizedPayment | null => {
  if (order.financial_status !== "paid") {
    return null;
  }
  return {
    kind: "payment",
    source: "shopify",
    orgId,
    sourcePaymentId: `${stringId(order.id)}:order_payment`,
    sourceOrderId: stringId(order.id),
    grossAmountMinor: decimalStringToMinor(order.total_price),
    /** Shopify's webhook payload doesn't reveal payment-processor fees here.
     *  Fees come from Stripe (the actual processor) when that connector
     *  lands; until then fee=0 and net=gross. */
    feeAmountMinor: 0,
    netAmountMinor: decimalStringToMinor(order.total_price),
    currency: order.currency,
    status: "paid",
    processedAt: new Date(order.created_at),
    sourceMetadata: { raw_topic: "orders/paid" },
  };
};

const refundToNormalized = (
  refund: ShopifyRefund,
  orgId: string
): NormalizedRefund => {
  const txns = refund.transactions ?? [];
  const successful = txns.filter(
    (t) => t.kind === "refund" && t.status === "success"
  );
  const amountMinor = successful.reduce(
    (s, t) => s + decimalStringToMinor(t.amount),
    0
  );
  const currency = successful[0]?.currency ?? "USD";
  const processedAt = refund.processed_at ?? refund.created_at;
  return {
    kind: "refund",
    source: "shopify",
    orgId,
    sourceRefundId: stringId(refund.id),
    sourceOrderId: stringId(refund.order_id),
    amountMinor,
    currency,
    reason: refund.note ?? null,
    processedAt: new Date(processedAt),
    sourceMetadata: { raw: refund },
  };
};

/**
 * parseEvent — strict Zod parse + canonical mapping.
 *
 * Returns 0..N NormalizedEvents. orders/create + orders/updated emit
 * exactly one Order; orders/paid emits an Order + a Payment;
 * refunds/create emits a Refund. orders/cancelled and app/uninstalled
 * are routed to the order/connection lifecycle but emit no
 * canonical-table events from parseEvent itself (the normalize job
 * handles cancellation by re-upserting the Order with cancelled_at).
 */
export const parseEvent = (ctx: ParseContext): NormalizedEvent[] => {
  const { rawPayload, topic, orgId } = ctx;
  switch (topic) {
    case "orders/create":
    case "orders/updated":
    case "orders/cancelled":
    case "backfill.order": {
      const order = shopifyOrderSchema.parse(rawPayload);
      return [orderToNormalized(order, orgId)];
    }
    case "orders/paid": {
      const order = shopifyOrderSchema.parse(rawPayload);
      const events: NormalizedEvent[] = [orderToNormalized(order, orgId)];
      const payment = orderToPayment(order, orgId);
      if (payment) {
        events.push(payment);
      }
      return events;
    }
    case "refunds/create": {
      const refund = shopifyRefundSchema.parse(rawPayload);
      return [refundToNormalized(refund, orgId)];
    }
    case "app/uninstalled": {
      shopifyAppUninstalledSchema.parse(rawPayload);
      return [];
    }
    default: {
      const _exhaustive: never = topic;
      throw new Error(`parseEvent: unknown topic ${String(_exhaustive)}`);
    }
  }
};
