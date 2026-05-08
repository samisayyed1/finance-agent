import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const dataConnections = pgTable(
  "data_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    encryptedCredentials: text("encrypted_credentials"),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("data_connections_org_idx").on(t.orgId),
    index("data_connections_expires_at_idx").on(t.expiresAt),
  ]
);

export type DataConnection = typeof dataConnections.$inferSelect;
export type NewDataConnection = typeof dataConnections.$inferInsert;

export const connectionAlerts = pgTable(
  "connection_alerts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull().default("medium"),
    message: text("message"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("connection_alerts_org_open_idx").on(
      t.orgId,
      t.resolvedAt,
      t.createdAt
    ),
  ]
);

export type ConnectionAlert = typeof connectionAlerts.$inferSelect;
export type NewConnectionAlert = typeof connectionAlerts.$inferInsert;

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => dataConnections.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    itemsProcessed: integer("items_processed").notNull().default(0),
    errorsJsonb: jsonb("errors_jsonb").notNull().default([]),
  },
  (t) => [index("sync_runs_org_started_idx").on(t.orgId, t.startedAt)]
);

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;

export const rawPayloads = pgTable(
  "raw_payloads",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    topic: text("topic"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    r2Key: text("r2_key").notNull(),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (t) => [index("raw_payloads_org_received_idx").on(t.orgId, t.receivedAt)]
);

export type RawPayload = typeof rawPayloads.$inferSelect;
export type NewRawPayload = typeof rawPayloads.$inferInsert;
