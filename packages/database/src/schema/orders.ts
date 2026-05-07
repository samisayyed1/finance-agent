import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceOrderId: text("source_order_id").notNull(),
    orderNumber: text("order_number"),
    customerEmail: text("customer_email"),
    currency: text("currency").notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    totalTax: numeric("total_tax", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalShipping: numeric("total_shipping", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalDiscount: numeric("total_discount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    createdAtSource: timestamp("created_at_source", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    cancelledAtSource: timestamp("cancelled_at_source", {
      withTimezone: true,
      mode: "date",
    }),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
    snapshotId: text("snapshot_id"),
    computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.orgId, t.source, t.sourceOrderId),
    index("orders_org_created_idx").on(t.orgId, t.createdAtSource),
  ]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export const orderLineItems = pgTable(
  "order_line_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceLineItemId: text("source_line_item_id").notNull(),
    sku: text("sku"),
    productId: text("product_id"),
    title: text("title"),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    totalDiscount: numeric("total_discount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.orgId, t.orderId, t.sourceLineItemId),
    index("order_line_items_order_idx").on(t.orderId),
  ]
);

export type OrderLineItem = typeof orderLineItems.$inferSelect;
export type NewOrderLineItem = typeof orderLineItems.$inferInsert;

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourcePaymentId: text("source_payment_id").notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    status: text("status"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    payoutId: uuid("payout_id"),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.orgId, t.source, t.sourcePaymentId),
    index("payments_org_processed_idx").on(t.orgId, t.processedAt),
    index("payments_order_idx").on(t.orderId),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceRefundId: text("source_refund_id").notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.orgId, t.source, t.sourceRefundId),
    index("refunds_org_processed_idx").on(t.orgId, t.processedAt),
  ]
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourcePayoutId: text("source_payout_id").notNull(),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    status: text("status"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    expectedArrivalAt: timestamp("expected_arrival_at", {
      withTimezone: true,
      mode: "date",
    }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true, mode: "date" }),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.orgId, t.source, t.sourcePayoutId),
    index("payouts_org_period_idx").on(t.orgId, t.periodStart),
  ]
);

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
