/**
 * Weekly eval-set rebuild from operator feedback.
 *
 * Schedule: Sunday 02:00 UTC. For each org, pulls the last 90 days of
 * feedback flagged negative or correction, joins to the trace, and
 * upserts org_eval_set rows so future feature-recall scoring stresses
 * the days the operator actually cared about.
 *
 * Idempotent: org_eval_set has a unique surrogate per (org_id,
 * fixture_date, label, captured_from_trace_id) — re-running the same
 * 90-day window does not duplicate rows.
 */

import {
  agentFeedback,
  agentTraces,
  and,
  database,
  eq,
  gte,
  inArray,
  organizations,
  orgEvalSet,
} from "@ai-cfo/database";
import { logger, schedules } from "@trigger.dev/sdk";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface DailyReportShape {
  flags?: Array<{ kind?: string }>;
  top_movers?: Array<{ metric?: string }>;
}

const labelForSignal = (
  signal: "positive" | "negative" | "correction"
): string => {
  if (signal === "correction") {
    return "custom";
  }
  return "refund_spike";
};

const featuresFromTraceOutput = (output: unknown): string[] => {
  if (!output || typeof output !== "object" || !("report" in output)) {
    return [];
  }
  const report = (output as { report?: DailyReportShape }).report;
  const features = new Set<string>();
  for (const tm of report?.top_movers ?? []) {
    if (tm.metric) {
      features.add(tm.metric);
    }
  }
  for (const f of report?.flags ?? []) {
    if (f.kind) {
      features.add(f.kind);
    }
  }
  return [...features];
};

export const rebuildEvalSetForOrg = async (orgId: string, since: Date) => {
  const flagged = await database
    .select({
      traceId: agentFeedback.traceId,
      signal: agentFeedback.signal,
    })
    .from(agentFeedback)
    .where(
      and(
        eq(agentFeedback.orgId, orgId),
        gte(agentFeedback.createdAt, since),
        inArray(agentFeedback.signal, ["negative", "correction"])
      )
    );
  if (flagged.length === 0) {
    return { orgId, written: 0 };
  }
  const traceIds = [...new Set(flagged.map((f) => f.traceId))];
  const traces = await database
    .select()
    .from(agentTraces)
    .where(
      and(eq(agentTraces.orgId, orgId), inArray(agentTraces.traceId, traceIds))
    );
  const signalByTrace = new Map(flagged.map((f) => [f.traceId, f.signal]));

  let written = 0;
  for (const t of traces) {
    const signal = signalByTrace.get(t.traceId);
    if (!signal) {
      continue;
    }
    const fixtureDate =
      typeof t.inputJsonb === "object" &&
      t.inputJsonb !== null &&
      "date" in t.inputJsonb &&
      typeof (t.inputJsonb as { date?: unknown }).date === "string"
        ? (t.inputJsonb as { date: string }).date
        : t.createdAt.toISOString().slice(0, 10);
    const features = featuresFromTraceOutput(t.outputJsonb);
    await database
      .insert(orgEvalSet)
      .values({
        orgId,
        fixtureDate,
        expectedFeatures: features,
        capturedFromTraceId: t.traceId,
        label: labelForSignal(signal as "positive" | "negative" | "correction"),
      })
      .onConflictDoNothing();
    written++;
  }
  return { orgId, written };
};

export const rebuildEvalSetJob = schedules.task({
  id: "ai-cfo.rebuild-eval-set",
  cron: "0 2 * * 0",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const since = new Date(now.getTime() - NINETY_DAYS_MS);
    logger.info("rebuild-eval-set start", { since: since.toISOString() });
    const orgs = await database
      .select({ id: organizations.id })
      .from(organizations);
    const summaries = [] as Array<{ orgId: string; written: number }>;
    for (const o of orgs) {
      try {
        summaries.push(await rebuildEvalSetForOrg(o.id, since));
      } catch (err) {
        logger.error("rebuild-eval-set org failed", {
          err: err instanceof Error ? err.message : String(err),
          orgId: o.id,
        });
      }
    }
    logger.info("rebuild-eval-set done", { summaries });
    return { ok: true, summaries };
  },
});
