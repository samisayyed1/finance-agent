import { z } from "zod";

/**
 * The Day-3 DailyReport contract — the single typed surface shared by:
 *   - the agent (emits this JSON as final assistant message),
 *   - the grounding validator (rejects if any numeric token isn't cited),
 *   - the renderers (Slack/Email/Markdown — pure functions on this shape).
 *
 * Iron rule echo (#6): every monetary or percentage token in the prose
 * fields (headline.value, summary, top_movers[].narrative, flags[].narrative,
 * actions[].reasoning) MUST carry an inline citation marker of the form
 * `[snapshot:<id>]`, `[anomaly:<id>]`, or `[flag:<id>]`. The grounding
 * validator (packages/agent/src/grounding/validator.ts) enforces this.
 *
 * Iron rule echo (#10): no Shopify/Stripe-specific fields here. Universal.
 */

// --- Money + percent string formats ---
const MONEY_STRING_RE = /^-?\$?\d[\d,]*(\.\d{1,2})?$/;
const moneyString = z
  .string()
  .regex(MONEY_STRING_RE, "Money must look like '$1,234.56' or '-$10.00'");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD");

// --- Citations (discriminated union) ---
export const SnapshotCitation = z.object({
  kind: z.literal("snapshot"),
  snapshot_id: z.string().min(1),
});
export const AnomalyCitation = z.object({
  kind: z.literal("anomaly"),
  anomaly_id: z.string().min(1),
});
export const FlagCitation = z.object({
  kind: z.literal("flag"),
  flag_id: z.string().min(1),
});
export const Citation = z.discriminatedUnion("kind", [
  SnapshotCitation,
  AnomalyCitation,
  FlagCitation,
]);
export type Citation = z.infer<typeof Citation>;

export const ConnectorSource = z.enum([
  "shopify",
  "stripe",
  "meta",
  "google",
  "quickbooks",
  "xero",
  "netsuite",
  "plaid",
]);
export type ConnectorSource = z.infer<typeof ConnectorSource>;

export const ReconciliationFlagKind = z.enum([
  "ORDER_MISSING_PAYMENT",
  "PAYMENT_WITHOUT_ORDER",
  "REFUND_MISMATCH",
  "DUPLICATE_ORDER",
  "FEE_DRIFT",
  "PAYOUT_GAP",
  "PERIOD_GAP",
]);
export type ReconciliationFlagKind = z.infer<typeof ReconciliationFlagKind>;

export const Severity = z.enum(["low", "medium", "high"]);

// --- Headline ---
export const Headline = z.object({
  metric: z.string().min(1),
  value: moneyString,
  delta_pct: z.number(),
  trend: z.enum(["up", "down", "flat"]),
  citation: SnapshotCitation,
});

// --- Top movers ---
export const TopMover = z.object({
  metric: z.string().min(1),
  value: moneyString,
  delta_abs: moneyString,
  delta_pct: z.number(),
  direction: z.enum(["positive", "negative"]),
  narrative: z.string().min(1),
  citations: z.array(Citation).min(1),
});

// --- Flags ---
export const FlagSummary = z.object({
  flag_id: z.string().min(1),
  kind: ReconciliationFlagKind,
  severity: Severity,
  narrative: z.string().min(1),
  citation: FlagCitation,
});

// --- Actions (recommendations only — Iron Rule #8) ---
export const ActionRecommendation = z.object({
  title: z.string().min(1),
  reasoning: z.string().min(1),
  irreversible: z.boolean(),
  citations: z.array(Citation).min(1),
});

// --- Sync health ---
export const SyncHealth = z.object({
  source: ConnectorSource,
  status: z.enum(["green", "yellow", "red"]),
  last_synced_at: z.string().datetime(),
  last_error: z.string().nullable().optional(),
});

// --- Metadata ---
export const ReportMetadata = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  generated_at: z.string().datetime(),
  trace_id: z.string().min(1),
});

// --- The full report ---
export const DailyReportSchema = z.object({
  org_id: z.string().uuid(),
  date: isoDate,
  snapshot_id: z.string().min(1),
  headline: Headline,
  summary: z.string().min(1),
  top_movers: z.array(TopMover),
  flags: z.array(FlagSummary),
  actions: z.array(ActionRecommendation),
  sync_health: z.array(SyncHealth),
  metadata: ReportMetadata,
});

export type DailyReport = z.infer<typeof DailyReportSchema>;
export type Headline = z.infer<typeof Headline>;
export type TopMover = z.infer<typeof TopMover>;
export type FlagSummary = z.infer<typeof FlagSummary>;
export type ActionRecommendation = z.infer<typeof ActionRecommendation>;
export type SyncHealth = z.infer<typeof SyncHealth>;
export type ReportMetadata = z.infer<typeof ReportMetadata>;
