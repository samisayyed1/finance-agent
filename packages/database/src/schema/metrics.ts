import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    snapshotId: text("snapshot_id").notNull().unique(),
    revenueGross: numeric("revenue_gross", { precision: 18, scale: 4 }),
    revenueNet: numeric("revenue_net", { precision: 18, scale: 4 }),
    refunds: numeric("refunds", { precision: 18, scale: 4 }),
    fees: numeric("fees", { precision: 18, scale: 4 }),
    adSpend: numeric("ad_spend", { precision: 18, scale: 4 }),
    grossMargin: numeric("gross_margin", { precision: 18, scale: 4 }),
    contributionProfit: numeric("contribution_profit", {
      precision: 18,
      scale: 4,
    }),
    roas: numeric("roas", { precision: 18, scale: 6 }),
    blendedMer: numeric("blended_mer", { precision: 18, scale: 6 }),
    cac: numeric("cac", { precision: 18, scale: 4 }),
    aov: numeric("aov", { precision: 18, scale: 4 }),
    orders: integer("orders"),
    newCustomers: integer("new_customers"),
    refundRate: numeric("refund_rate", { precision: 8, scale: 6 }),
    computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.date] }),
    index("daily_metrics_org_date_idx").on(t.orgId, t.date),
  ]
);

export type DailyMetrics = typeof dailyMetrics.$inferSelect;
export type NewDailyMetrics = typeof dailyMetrics.$inferInsert;
