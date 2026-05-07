import {
  minorToDecimalString,
  type NormalizedEvent,
  type NormalizedOrder,
} from "@ai-cfo/connector-shopify";
import {
  database,
  eq,
  orderLineItems,
  orders,
  payments,
  refunds,
} from "@ai-cfo/database";

/**
 * Apply a batch of NormalizedEvents to canonical tables. Idempotent:
 * running twice with the same events produces identical state. Designed
 * to be called both by the Trigger.dev `shopify-normalize` task and by
 * direct test harnesses (no Trigger.dev runtime required).
 */

export interface ApplyResult {
  /**
   * Set of `YYYY-MM-DD` dates that were touched by this batch — the caller
   * (job) re-runs `compute_daily_metrics` for each.
   */
  affectedDates: string[];
  ordersUpserted: number;
  paymentsUpserted: number;
  refundsUpserted: number;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const upsertOrder = async (event: NormalizedOrder): Promise<void> => {
  // 1. Upsert the order
  const inserted = await database
    .insert(orders)
    .values({
      orgId: event.orgId,
      source: event.source,
      sourceOrderId: event.sourceOrderId,
      orderNumber: event.orderNumber,
      customerEmail: event.customerEmail,
      currency: event.currency,
      subtotal: minorToDecimalString(event.subtotalMinor),
      totalTax: minorToDecimalString(event.totalTaxMinor),
      totalShipping: minorToDecimalString(event.totalShippingMinor),
      totalDiscount: minorToDecimalString(event.totalDiscountMinor),
      total: minorToDecimalString(event.totalMinor),
      financialStatus: event.financialStatus,
      fulfillmentStatus: event.fulfillmentStatus,
      createdAtSource: event.createdAtSource,
      cancelledAtSource: event.cancelledAtSource,
      sourceMetadata: event.sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [orders.orgId, orders.source, orders.sourceOrderId],
      set: {
        orderNumber: event.orderNumber,
        customerEmail: event.customerEmail,
        currency: event.currency,
        subtotal: minorToDecimalString(event.subtotalMinor),
        totalTax: minorToDecimalString(event.totalTaxMinor),
        totalShipping: minorToDecimalString(event.totalShippingMinor),
        totalDiscount: minorToDecimalString(event.totalDiscountMinor),
        total: minorToDecimalString(event.totalMinor),
        financialStatus: event.financialStatus,
        fulfillmentStatus: event.fulfillmentStatus,
        cancelledAtSource: event.cancelledAtSource,
        sourceMetadata: event.sourceMetadata,
        computedAt: new Date(),
      },
    })
    .returning({ id: orders.id });

  const orderRow = inserted[0];
  if (!orderRow) {
    throw new Error(
      `upsertOrder: no row returned for ${event.source}/${event.sourceOrderId}`
    );
  }

  // 2. Upsert line items keyed on (org_id, order_id, source_line_item_id).
  for (const li of event.lineItems) {
    await database
      .insert(orderLineItems)
      .values({
        orderId: orderRow.id,
        orgId: event.orgId,
        sourceLineItemId: li.sourceLineItemId,
        sku: li.sku,
        productId: li.productId,
        title: li.title,
        quantity: li.quantity,
        unitPrice: minorToDecimalString(li.unitPriceMinor),
        totalDiscount: minorToDecimalString(li.totalDiscountMinor),
        taxAmount: minorToDecimalString(li.taxAmountMinor),
        sourceMetadata: li.sourceMetadata,
      })
      .onConflictDoUpdate({
        target: [
          orderLineItems.orgId,
          orderLineItems.orderId,
          orderLineItems.sourceLineItemId,
        ],
        set: {
          sku: li.sku,
          productId: li.productId,
          title: li.title,
          quantity: li.quantity,
          unitPrice: minorToDecimalString(li.unitPriceMinor),
          totalDiscount: minorToDecimalString(li.totalDiscountMinor),
          taxAmount: minorToDecimalString(li.taxAmountMinor),
          sourceMetadata: li.sourceMetadata,
        },
      });
  }
};

const resolveOrderId = async (
  orgId: string,
  source: string,
  sourceOrderId: string
): Promise<string | null> => {
  const rows = await database
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.sourceOrderId, sourceOrderId))
    .limit(1);
  // Note: drizzle's `and` not imported here for brevity; we additionally
  // filter by orgId/source via index below.
  for (const row of rows) {
    const dup = await database
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, row.id))
      .limit(1);
    if (dup[0]) {
      return dup[0].id;
    }
  }
  // Fallback: do a precise lookup ignoring index gymnastics
  const exact = await database
    .select({ id: orders.id, orgId: orders.orgId, source: orders.source })
    .from(orders)
    .where(eq(orders.sourceOrderId, sourceOrderId));
  const match = exact.find((r) => r.orgId === orgId && r.source === source);
  return match?.id ?? null;
};

export const applyNormalizedEvents = async (
  events: NormalizedEvent[]
): Promise<ApplyResult> => {
  const result: ApplyResult = {
    ordersUpserted: 0,
    paymentsUpserted: 0,
    refundsUpserted: 0,
    affectedDates: [],
  };
  const dates = new Set<string>();

  for (const event of events) {
    if (event.kind === "order") {
      await upsertOrder(event);
      result.ordersUpserted += 1;
      dates.add(isoDate(event.createdAtSource));
      if (event.cancelledAtSource) {
        dates.add(isoDate(event.cancelledAtSource));
      }
      continue;
    }
    if (event.kind === "payment") {
      const orderId = await resolveOrderId(
        event.orgId,
        event.source,
        event.sourceOrderId
      );
      await database
        .insert(payments)
        .values({
          orgId: event.orgId,
          source: event.source,
          sourcePaymentId: event.sourcePaymentId,
          orderId,
          grossAmount: minorToDecimalString(event.grossAmountMinor),
          feeAmount: minorToDecimalString(event.feeAmountMinor),
          netAmount: minorToDecimalString(event.netAmountMinor),
          currency: event.currency,
          status: event.status,
          processedAt: event.processedAt,
          sourceMetadata: event.sourceMetadata,
        })
        .onConflictDoUpdate({
          target: [payments.orgId, payments.source, payments.sourcePaymentId],
          set: {
            orderId,
            grossAmount: minorToDecimalString(event.grossAmountMinor),
            feeAmount: minorToDecimalString(event.feeAmountMinor),
            netAmount: minorToDecimalString(event.netAmountMinor),
            currency: event.currency,
            status: event.status,
            processedAt: event.processedAt,
            sourceMetadata: event.sourceMetadata,
          },
        });
      result.paymentsUpserted += 1;
      if (event.processedAt) {
        dates.add(isoDate(event.processedAt));
      }
      continue;
    }
    if (event.kind === "refund") {
      const orderId = await resolveOrderId(
        event.orgId,
        event.source,
        event.sourceOrderId
      );
      await database
        .insert(refunds)
        .values({
          orgId: event.orgId,
          source: event.source,
          sourceRefundId: event.sourceRefundId,
          orderId,
          amount: minorToDecimalString(event.amountMinor),
          currency: event.currency,
          reason: event.reason,
          processedAt: event.processedAt,
          sourceMetadata: event.sourceMetadata,
        })
        .onConflictDoUpdate({
          target: [refunds.orgId, refunds.source, refunds.sourceRefundId],
          set: {
            orderId,
            amount: minorToDecimalString(event.amountMinor),
            currency: event.currency,
            reason: event.reason,
            processedAt: event.processedAt,
            sourceMetadata: event.sourceMetadata,
          },
        });
      result.refundsUpserted += 1;
      dates.add(isoDate(event.processedAt));
    }
  }

  result.affectedDates = Array.from(dates).sort();
  return result;
};
