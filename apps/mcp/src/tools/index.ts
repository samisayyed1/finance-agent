/**
 * MCP tool catalog — Day-3 real implementations.
 *
 * Every tool is a Zod-typed read-only operation against the deterministic
 * truth layer (Supabase via Drizzle), with one exception: `record_feedback`
 * writes to `agent_feedback`. RLS-scoped via the bearer-token middleware
 * at apps/mcp/src/middleware.ts which sets `request.context.org_id` and
 * passes that through to each handler.
 *
 * Iron rule echo (#6): every numeric in a tool's response carries the
 * citation token (`snapshot_id` for daily metrics, `anomaly_id` for
 * anomalies, `flag_id` for reconciliation flags). The agent's grounding
 * validator depends on these.
 */

import {
  agentFeedback,
  and,
  anomalies,
  dailyMetrics,
  database,
  dataConnections,
  desc,
  eq,
  gte,
  lt,
  lte,
  reconciliationFlags,
  syncRuns,
} from "@ai-cfo/database";
import { z } from "zod";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = () => z.string().regex(ISO_DATE_RE, "ISO date YYYY-MM-DD");

const startOfUtcDay = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const startOfNextUtcDay = (s: string): Date => {
  const d = startOfUtcDay(s);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

// --- Schemas ---

export const getDailySnapshotInput = z.object({
  date: isoDate(),
});

export const getMetricHistoryInput = z.object({
  metric: z.enum([
    "revenue_net",
    "revenue_gross",
    "contribution_profit",
    "ad_spend",
    "fees",
    "refunds",
    "orders",
  ]),
  days: z.number().int().min(1).max(365),
  asOf: isoDate().optional(),
});

export const listAnomaliesInput = z.object({
  date: isoDate(),
  severity: z.enum(["low", "medium", "high"]).optional(),
});

export const getReconciliationFlagsInput = z.object({
  date_range: z.object({ start: isoDate(), end: isoDate() }),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
});

export const getSyncHealthInput = z.object({});

export const recordFeedbackInput = z.object({
  trace_id: z.string().min(1),
  signal: z.enum(["positive", "negative", "correction"]),
  message: z.string().optional(),
  channel: z.enum(["slack", "email", "dashboard", "whatsapp"]),
  operator_user_id: z.string().optional(),
});

// --- Handlers ---

const handleGetDailySnapshot = async (
  orgId: string,
  input: z.infer<typeof getDailySnapshotInput>
) => {
  const rows = await database
    .select()
    .from(dailyMetrics)
    .where(
      and(eq(dailyMetrics.orgId, orgId), eq(dailyMetrics.date, input.date))
    )
    .limit(1);
  const metric = rows[0] ?? null;

  const fourteenDaysAgo = new Date(startOfUtcDay(input.date));
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  const recentAnomalies = await database
    .select()
    .from(anomalies)
    .where(
      and(
        eq(anomalies.orgId, orgId),
        gte(anomalies.date, fourteenDaysAgo.toISOString().slice(0, 10)),
        lte(anomalies.date, input.date)
      )
    );

  const openFlagsCount = await database
    .select({ id: reconciliationFlags.id })
    .from(reconciliationFlags)
    .where(
      and(
        eq(reconciliationFlags.orgId, orgId),
        eq(reconciliationFlags.status, "open")
      )
    );

  return {
    snapshot_id: metric?.snapshotId ?? `MISSING_${orgId}_${input.date}`,
    date: input.date,
    revenue_gross: metric?.revenueGross ?? null,
    revenue_net: metric?.revenueNet ?? null,
    refunds: metric?.refunds ?? null,
    fees: metric?.fees ?? null,
    contribution_profit: metric?.contributionProfit ?? null,
    orders: metric?.orders ?? null,
    aov: metric?.aov ?? null,
    open_flags_count: openFlagsCount.length,
    recent_anomalies: recentAnomalies.map((a) => ({
      anomaly_id: a.anomalyId,
      date: a.date,
      metric: a.metric,
      severity: a.severity,
      z_score: a.zScore,
    })),
  } as const;
};

const handleGetMetricHistory = async (
  orgId: string,
  input: z.infer<typeof getMetricHistoryInput>
) => {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const start = new Date(startOfUtcDay(asOf));
  start.setUTCDate(start.getUTCDate() - input.days + 1);

  const rows = await database
    .select()
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.orgId, orgId),
        gte(dailyMetrics.date, start.toISOString().slice(0, 10)),
        lte(dailyMetrics.date, asOf)
      )
    )
    .orderBy(desc(dailyMetrics.date));

  const metric = input.metric;
  const pickColumn = (r: (typeof rows)[number]) => {
    const map: Record<typeof metric, unknown> = {
      orders: r.orders,
      revenue_net: r.revenueNet,
      revenue_gross: r.revenueGross,
      contribution_profit: r.contributionProfit,
      ad_spend: r.adSpend,
      fees: r.fees,
      refunds: r.refunds,
    };
    return map[metric];
  };
  const series = rows.map((r) => ({
    date: r.date,
    snapshot_id: r.snapshotId,
    value: pickColumn(r),
  }));

  return { metric, asOf, days: input.days, series };
};

const handleListAnomalies = async (
  orgId: string,
  input: z.infer<typeof listAnomaliesInput>
) => {
  const sevenDaysAgo = new Date(startOfUtcDay(input.date));
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const where = and(
    eq(anomalies.orgId, orgId),
    gte(anomalies.date, sevenDaysAgo.toISOString().slice(0, 10)),
    lte(anomalies.date, input.date),
    input.severity ? eq(anomalies.severity, input.severity) : undefined
  );

  const rows = await database
    .select()
    .from(anomalies)
    .where(where)
    .orderBy(desc(anomalies.date));

  return rows.map((r) => ({
    anomaly_id: r.anomalyId,
    date: r.date,
    metric: r.metric,
    severity: r.severity,
    z_score: r.zScore,
    prev_value: r.prevValue,
    current_value: r.currentValue,
    suggested_cause: r.suggestedCause,
  }));
};

const handleGetReconciliationFlags = async (
  orgId: string,
  input: z.infer<typeof getReconciliationFlagsInput>
) => {
  const start = startOfUtcDay(input.date_range.start);
  const end = startOfNextUtcDay(input.date_range.end);

  const where = and(
    eq(reconciliationFlags.orgId, orgId),
    gte(reconciliationFlags.createdAt, start),
    lt(reconciliationFlags.createdAt, end),
    input.status ? eq(reconciliationFlags.status, input.status) : undefined
  );

  const rows = await database
    .select()
    .from(reconciliationFlags)
    .where(where)
    .orderBy(desc(reconciliationFlags.createdAt));

  return rows.map((r) => ({
    flag_id: r.flagId,
    kind: r.kind,
    status: r.status,
    payment_id: r.paymentId,
    order_id: r.orderId,
    expected: r.expected,
    actual: r.actual,
    delta: r.delta,
    created_at: r.createdAt.toISOString(),
  }));
};

const handleGetSyncHealth = async (orgId: string) => {
  const conns = await database
    .select()
    .from(dataConnections)
    .where(eq(dataConnections.orgId, orgId));

  const enriched = await Promise.all(
    conns.map(async (c) => {
      const lastRun = await database
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.connectionId, c.id))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);
      return {
        source: c.source,
        status: c.status,
        last_synced_at: c.lastSyncedAt?.toISOString() ?? null,
        last_error: c.lastError ?? lastRun[0]?.errorsJsonb ?? null,
      };
    })
  );

  return enriched;
};

const handleRecordFeedback = async (
  orgId: string,
  input: z.infer<typeof recordFeedbackInput>
) => {
  const inserted = await database
    .insert(agentFeedback)
    .values({
      orgId,
      traceId: input.trace_id,
      signal: input.signal,
      message: input.message ?? null,
      channel: input.channel,
      operatorUserId: input.operator_user_id ?? null,
    })
    .returning({ id: agentFeedback.id });
  return { ok: true as const, id: inserted[0]?.id };
};

// --- Tool catalog (used by the MCP bridge in apps/mcp/src/hono-bridge.ts) ---

export interface ToolHandlerCtx {
  orgId: string;
}

export const tools = {
  get_daily_snapshot: {
    description:
      "Return the cent-exact daily metrics snapshot for a given date for the requesting org, plus open-flag count and recent anomalies.",
    inputSchema: getDailySnapshotInput,
    handler: (ctx: ToolHandlerCtx, input: unknown) =>
      handleGetDailySnapshot(ctx.orgId, getDailySnapshotInput.parse(input)),
  },
  get_metric_history: {
    description:
      "Return a time series of one metric for the last N days. Each row carries snapshot_id for citation.",
    inputSchema: getMetricHistoryInput,
    handler: (ctx: ToolHandlerCtx, input: unknown) =>
      handleGetMetricHistory(ctx.orgId, getMetricHistoryInput.parse(input)),
  },
  list_anomalies: {
    description:
      "List anomalies on a given date and the prior 7 days. Each row's anomaly_id is the citation token.",
    inputSchema: listAnomaliesInput,
    handler: (ctx: ToolHandlerCtx, input: unknown) =>
      handleListAnomalies(ctx.orgId, listAnomaliesInput.parse(input)),
  },
  get_reconciliation_flags: {
    description:
      "List reconciliation flags within a date range, optionally filtered by status.",
    inputSchema: getReconciliationFlagsInput,
    handler: (ctx: ToolHandlerCtx, input: unknown) =>
      handleGetReconciliationFlags(
        ctx.orgId,
        getReconciliationFlagsInput.parse(input)
      ),
  },
  get_sync_health: {
    description:
      "Return the sync status of every connected data source for the requesting org.",
    inputSchema: getSyncHealthInput,
    handler: (ctx: ToolHandlerCtx, _input: unknown) =>
      handleGetSyncHealth(ctx.orgId),
  },
  record_feedback: {
    description:
      "Record an operator's reaction to a daily-report trace (positive / negative / correction).",
    inputSchema: recordFeedbackInput,
    handler: (ctx: ToolHandlerCtx, input: unknown) =>
      handleRecordFeedback(ctx.orgId, recordFeedbackInput.parse(input)),
  },
} as const;

export type ToolName = keyof typeof tools;
