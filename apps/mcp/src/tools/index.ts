import { z } from "zod";

/**
 * MCP tool catalog for AI Operating CFO.
 *
 * Every tool is a typed (Zod) read-only or write-only operation against the
 * deterministic truth layer (Supabase). The agent calls these via MCP; it
 * never computes numbers itself. Outputs returned by these tools carry the
 * citation ids (snapshot_id, anomaly_id, flag_id) that the grounding
 * validator checks for in the agent's final response.
 *
 * Day-0 status: every tool returns `{ error: "not implemented" }` so the
 * MCP wiring is verifiable end-to-end while implementations land in Phase 5+.
 */

const notImplemented = (tool: string) =>
  ({ error: "not implemented", tool }) as const;

// --- Shared regex (hoisted to module scope per Biome `useTopLevelRegex`) ---
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = () => z.string().regex(ISO_DATE_RE, "ISO date YYYY-MM-DD");

// --- Schemas (input + output) ---

export const getDailySnapshotInput = z.object({
  date: isoDate(),
});
export const getDailySnapshotOutput = z.union([
  z.object({
    snapshot_id: z.string(),
    date: isoDate(),
    revenue_net: z.number(),
    contribution_profit: z.number(),
    roas: z.number(),
    orders: z.number().int(),
    computed_at: z.string().datetime(),
  }),
  z.object({ error: z.string(), tool: z.string() }),
]);

export const getMetricHistoryInput = z.object({
  metric: z.enum([
    "revenue_net",
    "revenue_gross",
    "contribution_profit",
    "ad_spend",
    "roas",
    "orders",
  ]),
  days: z.number().int().min(1).max(365),
});

export const listAnomaliesInput = z.object({
  date: isoDate(),
  severity: z.enum(["low", "medium", "high"]).optional(),
});

export const getReconciliationFlagsInput = z.object({
  date_range: z.object({
    from: isoDate(),
    to: isoDate(),
  }),
});

export const getCampaignPerfInput = z.object({
  date: isoDate(),
  platform: z.enum(["meta", "google"]).optional(),
});

export const listTopProductsInput = z.object({
  date: isoDate(),
  by: z.enum(["revenue", "units", "margin"]),
  n: z.number().int().min(1).max(50),
});

export const getSyncHealthInput = z.object({});

export const getRelevantMemoriesInput = z.object({
  query: z.string().min(1),
  k: z.number().int().min(1).max(50).default(5),
});

export const recordFeedbackInput = z.object({
  trace_id: z.string(),
  signal: z.enum(["positive", "negative", "correction"]),
  message: z.string().optional(),
});

// --- Implementations (Day-0 stubs) ---

export const tools = {
  get_daily_snapshot: {
    description:
      "Return the cent-exact daily metrics snapshot for a given date for the requesting org.",
    inputSchema: getDailySnapshotInput,
    handler: async (_input: z.infer<typeof getDailySnapshotInput>) =>
      notImplemented("get_daily_snapshot"),
  },
  get_metric_history: {
    description: "Return the last N days of a single metric for the org.",
    inputSchema: getMetricHistoryInput,
    handler: async (_input: z.infer<typeof getMetricHistoryInput>) =>
      notImplemented("get_metric_history"),
  },
  list_anomalies: {
    description:
      "List anomalies detected on a given date, optionally filtered by severity.",
    inputSchema: listAnomaliesInput,
    handler: async (_input: z.infer<typeof listAnomaliesInput>) =>
      notImplemented("list_anomalies"),
  },
  get_reconciliation_flags: {
    description: "List open reconciliation flags within a date range.",
    inputSchema: getReconciliationFlagsInput,
    handler: async (_input: z.infer<typeof getReconciliationFlagsInput>) =>
      notImplemented("get_reconciliation_flags"),
  },
  get_campaign_perf: {
    description:
      "Return ad-spend, ROAS, and impressions per campaign for a given date.",
    inputSchema: getCampaignPerfInput,
    handler: async (_input: z.infer<typeof getCampaignPerfInput>) =>
      notImplemented("get_campaign_perf"),
  },
  list_top_products: {
    description:
      "List top products for a given date ranked by revenue, units, or margin.",
    inputSchema: listTopProductsInput,
    handler: async (_input: z.infer<typeof listTopProductsInput>) =>
      notImplemented("list_top_products"),
  },
  get_sync_health: {
    description:
      "Return the sync status of every connected source for the requesting org.",
    inputSchema: getSyncHealthInput,
    handler: async (_input: z.infer<typeof getSyncHealthInput>) =>
      notImplemented("get_sync_health"),
  },
  get_relevant_memories: {
    description:
      "Vector-search agent_memories for the org, scoped to the requesting org_id.",
    inputSchema: getRelevantMemoriesInput,
    handler: async (_input: z.infer<typeof getRelevantMemoriesInput>) =>
      notImplemented("get_relevant_memories"),
  },
  record_feedback: {
    description:
      "Record an operator's reaction to a trace (positive / negative / correction).",
    inputSchema: recordFeedbackInput,
    handler: async (_input: z.infer<typeof recordFeedbackInput>) =>
      notImplemented("record_feedback"),
  },
} as const;

export type ToolName = keyof typeof tools;
