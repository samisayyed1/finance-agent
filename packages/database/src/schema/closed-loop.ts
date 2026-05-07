import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const agentTraces = pgTable(
  "agent_traces",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    traceId: text("trace_id").notNull().unique(),
    tool: text("tool").notNull(),
    inputJsonb: jsonb("input_jsonb").notNull(),
    outputJsonb: jsonb("output_jsonb").notNull(),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    snapshotIds: text("snapshot_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    anomalyIds: text("anomaly_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    flagIds: text("flag_ids").array().notNull().default(sql`'{}'::text[]`),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agent_traces_org_created_idx").on(t.orgId, t.createdAt)]
);

export type AgentTrace = typeof agentTraces.$inferSelect;
export type NewAgentTrace = typeof agentTraces.$inferInsert;

export const agentFeedback = pgTable(
  "agent_feedback",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    traceId: text("trace_id").notNull(),
    signal: text("signal").notNull(),
    operatorUserId: text("operator_user_id"),
    message: text("message"),
    channel: text("channel").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agent_feedback_org_trace_idx").on(t.orgId, t.traceId)]
);

export type AgentFeedback = typeof agentFeedback.$inferSelect;
export type NewAgentFeedback = typeof agentFeedback.$inferInsert;

export const agentOutcomes = pgTable(
  "agent_outcomes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recommendationId: text("recommendation_id").notNull(),
    wasTaken: boolean("was_taken"),
    measuredImpactUsd: numeric("measured_impact_usd", {
      precision: 18,
      scale: 4,
    }),
    measuredAt: timestamp("measured_at", { withTimezone: true, mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_outcomes_org_recommendation_idx").on(
      t.orgId,
      t.recommendationId
    ),
  ]
);

export type AgentOutcome = typeof agentOutcomes.$inferSelect;
export type NewAgentOutcome = typeof agentOutcomes.$inferInsert;

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    contentJsonb: jsonb("content_jsonb").notNull(),
    contentMd: text("content_md").notNull(),
    deliveryStatus: jsonb("delivery_status").notNull().default({}),
    aiTraceId: text("ai_trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reports_org_date_idx").on(t.orgId, t.date)]
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

export const orgSettings = pgTable("org_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  dailyReportTime: text("daily_report_time").notNull().default("07:00:00"),
  dailyReportTimezone: text("daily_report_timezone")
    .notNull()
    .default("America/New_York"),
  deliveryEmailEnabled: boolean("delivery_email_enabled")
    .notNull()
    .default(true),
  deliverySlackEnabled: boolean("delivery_slack_enabled")
    .notNull()
    .default(false),
  deliveryWhatsappEnabled: boolean("delivery_whatsapp_enabled")
    .notNull()
    .default(false),
  slackChannelId: text("slack_channel_id"),
  whatsappNumber: text("whatsapp_number"),
  monthlyPdfEnabled: boolean("monthly_pdf_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
export type NewOrgSettings = typeof orgSettings.$inferInsert;
