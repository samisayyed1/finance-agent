import { sql } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const anomalies = pgTable(
  "anomalies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    anomalyId: text("anomaly_id").notNull().unique(),
    date: date("date").notNull(),
    metric: text("metric").notNull(),
    severity: text("severity").notNull(),
    zScore: numeric("z_score", { precision: 10, scale: 4 }),
    prevValue: numeric("prev_value", { precision: 18, scale: 4 }),
    currentValue: numeric("current_value", { precision: 18, scale: 4 }),
    suggestedCause: text("suggested_cause"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("anomalies_org_date_idx").on(t.orgId, t.date)]
);

export type Anomaly = typeof anomalies.$inferSelect;
export type NewAnomaly = typeof anomalies.$inferInsert;

export const reconciliationFlags = pgTable(
  "reconciliation_flags",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    flagId: text("flag_id").notNull().unique(),
    kind: text("kind").notNull(),
    paymentId: text("payment_id"),
    orderId: text("order_id"),
    expected: numeric("expected", { precision: 18, scale: 4 }),
    actual: numeric("actual", { precision: 18, scale: 4 }),
    delta: numeric("delta", { precision: 18, scale: 4 }),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reconciliation_flags_org_status_idx").on(t.orgId, t.status)]
);

export type ReconciliationFlag = typeof reconciliationFlags.$inferSelect;
export type NewReconciliationFlag = typeof reconciliationFlags.$inferInsert;
