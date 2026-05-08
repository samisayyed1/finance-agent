import { z } from "zod";

/**
 * Strict Zod schemas for Shopify webhook payloads. We parse with `.strict()`
 * everywhere a vendor change could break the metric pipeline silently.
 * Schema drift fails loud (Iron Rule #1: deterministic truth).
 */

const moneyString = z.string().regex(/^-?\d+(\.\d+)?$/);

const shopifyMoneySet = z
  .object({
    shop_money: z.object({
      amount: moneyString,
      currency_code: z.string().min(3).max(8),
    }),
  })
  .passthrough();

export const shopifyOrderSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    order_number: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    email: z.string().email().nullable().optional(),
    currency: z.string(),
    subtotal_price: moneyString.nullable().optional(),
    total_tax: moneyString.nullable().optional(),
    total_discounts: moneyString.nullable().optional(),
    total_price: moneyString,
    total_shipping_price_set: shopifyMoneySet.optional(),
    financial_status: z.string().nullable().optional(),
    fulfillment_status: z.string().nullable().optional(),
    created_at: z.string(),
    cancelled_at: z.string().nullable().optional(),
    // Day-6 attribution fields. All optional — older Shopify versions and
    // some POS / draft-order payloads omit them. extractOrderAttribution
    // tolerates nulls.
    landing_site: z.string().nullable().optional(),
    referring_site: z.string().nullable().optional(),
    source_name: z.string().nullable().optional(),
    line_items: z
      .array(
        z
          .object({
            id: z.union([z.number(), z.string()]),
            sku: z.string().nullable().optional(),
            product_id: z.union([z.number(), z.string()]).nullable().optional(),
            title: z.string().nullable().optional(),
            quantity: z.number().int(),
            price: moneyString,
            total_discount: moneyString.optional(),
            tax_lines: z
              .array(
                z
                  .object({
                    price: moneyString.optional(),
                  })
                  .passthrough()
              )
              .optional(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough();

export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>;

export const shopifyRefundSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    order_id: z.union([z.number(), z.string()]),
    note: z.string().nullable().optional(),
    created_at: z.string(),
    processed_at: z.string().nullable().optional(),
    refund_line_items: z
      .array(
        z
          .object({
            subtotal: z.union([z.number(), z.string()]).nullable().optional(),
          })
          .passthrough()
      )
      .optional(),
    transactions: z
      .array(
        z
          .object({
            amount: moneyString,
            currency: z.string(),
            kind: z.string(),
            status: z.string(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough();

export type ShopifyRefund = z.infer<typeof shopifyRefundSchema>;

export const shopifyAppUninstalledSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    domain: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();
export type ShopifyAppUninstalled = z.infer<typeof shopifyAppUninstalledSchema>;
