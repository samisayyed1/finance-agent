import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
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

/**
 * pgvector column. Stored on disk as a postgres `vector(N)` (HNSW-indexed
 * elsewhere); in JS land it's a `number[]`. Drizzle has no first-class
 * type for pgvector yet, so we register it via customType. Day-4 dim is
 * 1536 to match OpenAI text-embedding-3-small.
 */
const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dimensions})`,
    toDriver: (value: number[]) => `[${value.join(",")}]`,
    fromDriver: (value: string) => {
      // pgvector returns "[v1,v2,...]" strings via the postgres-js driver.
      const trimmed = value.replace(/^\[|\]$/g, "");
      return trimmed.length === 0 ? [] : trimmed.split(",").map(Number);
    },
  })(name);

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
    memoryIds: text("memory_ids").array().notNull().default(sql`'{}'::text[]`),
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

/**
 * Per-org agent memory store. Each row is a single natural-language
 * fact distilled from traces / feedback / outcomes. The HNSW index on
 * `embedding` (declared in the migration) is what makes `retrieveMemories`
 * fast even at six-figure row counts per org. Temporal validity is
 * tracked via `valid_from` + `valid_until` so memories can be soft-
 * forgotten without losing audit trail.
 *
 * Iron rule echo (#9): RLS scopes every read by org_id; cross-tenant
 * pooling is forbidden. The vector index is shared across orgs at the
 * physical level, but the policy `using (org_id = requesting_org_id())`
 * means a query for org A literally cannot return org B's rows.
 */
export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", 1536),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
    sourceTraceId: text("source_trace_id"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_memories_org_validity_idx").on(
      t.orgId,
      t.validFrom,
      t.validUntil
    ),
  ]
);

export type AgentMemory = typeof agentMemories.$inferSelect;
export type NewAgentMemory = typeof agentMemories.$inferInsert;

export const orgEvalSet = pgTable(
  "org_eval_set",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fixtureDate: date("fixture_date").notNull(),
    expectedFeatures: text("expected_features")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    capturedFromTraceId: text("captured_from_trace_id"),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("org_eval_set_org_label_idx").on(t.orgId, t.label)]
);

export type OrgEvalSet = typeof orgEvalSet.$inferSelect;
export type NewOrgEvalSet = typeof orgEvalSet.$inferInsert;

export const orgThresholds = pgTable(
  "org_thresholds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    thresholdKind: text("threshold_kind").notNull(),
    thresholdValue: numeric("threshold_value", {
      precision: 18,
      scale: 6,
    }).notNull(),
    lastTunedAt: timestamp("last_tuned_at", {
      withTimezone: true,
      mode: "date",
    }),
    tuneMethod: text("tune_method"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("org_thresholds_org_metric_kind_unique").on(
      t.orgId,
      t.metric,
      t.thresholdKind
    ),
  ]
);

export type OrgThreshold = typeof orgThresholds.$inferSelect;
export type NewOrgThreshold = typeof orgThresholds.$inferInsert;

/**
 * Day-4 closed-loop measurement. One row per (org, day). Three KPIs that
 * answer "is the per-org loop actually compounding?":
 *   grounding_rate    — fraction of traces that passed the grounding
 *                       validator. Should hold ≥ 0.99 for healthy orgs.
 *   feature_recall    — vs `org_eval_set.expected_features`. Defaults to
 *                       1.0 if the eval set is empty.
 *   outcome_accuracy  — fraction of recommendations the operator both
 *                       took and that produced positive measured impact.
 *
 * If any of these is flat for ≥ 60 days, the loop is broken; the
 * measure-closed-loop job emits an alert.
 */
export const closedLoopMetrics = pgTable(
  "closed_loop_metrics",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    groundingRate: numeric("grounding_rate", { precision: 5, scale: 4 }),
    featureRecall: numeric("feature_recall", { precision: 5, scale: 4 }),
    outcomeAccuracy: numeric("outcome_accuracy", { precision: 5, scale: 4 }),
    tracesCount: integer("traces_count").notNull().default(0),
    feedbackCount: integer("feedback_count").notNull().default(0),
    memoriesWritten: integer("memories_written").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("closed_loop_metrics_org_date_unique").on(t.orgId, t.date),
    index("closed_loop_metrics_org_date_idx").on(t.orgId, t.date),
  ]
);

export type ClosedLoopMetric = typeof closedLoopMetrics.$inferSelect;
export type NewClosedLoopMetric = typeof closedLoopMetrics.$inferInsert;
