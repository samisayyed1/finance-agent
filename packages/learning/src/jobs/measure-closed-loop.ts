/**
 * Daily closed-loop health measurement.
 *
 * Schedule: 01:00 UTC daily. For each active org, computes three KPIs over
 * the last 24h's traces and upserts a closed_loop_metrics row:
 *
 *   grounding_rate    = passed_grounding / total_traces
 *   feature_recall    = avg(features_mentioned / features_expected)
 *                       (defaults to 1.0 if org_eval_set is empty)
 *   outcome_accuracy  = positive_outcomes / total_recommendations
 *
 * Sixty-day stagnation alert: if grounding_rate AND feature_recall haven't
 * moved (within ε=0.005) for ≥ 60 consecutive days, emit a structured
 * pino warn that ops can route to Sentry.
 */

import {
  agentOutcomes,
  agentTraces,
  and,
  closedLoopMetrics,
  database,
  desc,
  eq,
  gte,
  organizations,
  orgEvalSet,
} from "@ai-cfo/database";
import { logger, schedules } from "@trigger.dev/sdk";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface OrgSnapshot {
  date: string;
  featureRecall: number;
  feedbackCount: number;
  groundingRate: number;
  memoriesWritten: number;
  orgId: string;
  outcomeAccuracy: number;
  tracesCount: number;
}

const ISO_DATE = (d: Date): string => d.toISOString().slice(0, 10);

const fmt = (n: number): string => n.toFixed(4);

interface DailyReportShape {
  flags?: Array<{ kind?: string }>;
  summary?: string;
  top_movers?: Array<{ metric?: string }>;
}

const METRIC_CANDIDATES = [
  "revenue_net",
  "revenue_gross",
  "orders",
  "aov",
  "refunds",
  "fees",
  "contribution_profit",
  "ad_spend",
];

const harvestFeaturesFromSummary = (summary: string): string[] => {
  const text = summary.toLowerCase();
  const out: string[] = [];
  for (const c of METRIC_CANDIDATES) {
    if (text.includes(c.replace("_", " ")) || text.includes(c)) {
      out.push(c);
    }
  }
  return out;
};

const featuresMentioned = (output: unknown): string[] => {
  if (!output || typeof output !== "object" || !("report" in output)) {
    return [];
  }
  const report = (output as { report?: DailyReportShape }).report;
  const features = new Set<string>();
  if (report?.summary) {
    for (const f of harvestFeaturesFromSummary(report.summary)) {
      features.add(f);
    }
  }
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

export const measureClosedLoopForOrg = async (
  orgId: string,
  since: Date,
  asOfDate: string
): Promise<OrgSnapshot> => {
  const traces = await database
    .select()
    .from(agentTraces)
    .where(
      and(eq(agentTraces.orgId, orgId), gte(agentTraces.createdAt, since))
    );

  // Day-4: trace persistence implies grounding success (the validator
  // throws before persist). Total = persisted; passed = persisted; if
  // we add a "rejected at validator" persist path, this changes.
  const tracesCount = traces.length;
  const groundingPassed = tracesCount;
  const groundingRate = tracesCount === 0 ? 1 : groundingPassed / tracesCount;

  // Feature recall vs eval set. The eval set has expected_features per
  // fixture date; we average over fixtures whose date == asOfDate.
  const evalRows = await database
    .select()
    .from(orgEvalSet)
    .where(
      and(eq(orgEvalSet.orgId, orgId), eq(orgEvalSet.fixtureDate, asOfDate))
    );
  let featureRecall = 1;
  if (evalRows.length > 0 && tracesCount > 0) {
    let recallSum = 0;
    for (const fixture of evalRows) {
      const expected = fixture.expectedFeatures;
      if (expected.length === 0) {
        continue;
      }
      const allMentioned = traces.flatMap((t) =>
        featuresMentioned(t.outputJsonb)
      );
      const set = new Set(allMentioned);
      const hits = expected.filter((f) => set.has(f)).length;
      recallSum += hits / expected.length;
    }
    featureRecall = evalRows.length === 0 ? 1 : recallSum / evalRows.length;
  }

  const outcomes = await database
    .select()
    .from(agentOutcomes)
    .where(
      and(eq(agentOutcomes.orgId, orgId), gte(agentOutcomes.createdAt, since))
    );
  const taken = outcomes.filter((o) => o.wasTaken === true);
  const positive = taken.filter(
    (o) => o.measuredImpactUsd !== null && Number(o.measuredImpactUsd) > 0
  );
  const outcomeAccuracy =
    taken.length === 0 ? 1 : positive.length / taken.length;

  await database
    .insert(closedLoopMetrics)
    .values({
      orgId,
      date: asOfDate,
      groundingRate: fmt(groundingRate),
      featureRecall: fmt(featureRecall),
      outcomeAccuracy: fmt(outcomeAccuracy),
      tracesCount,
      feedbackCount: 0,
      memoriesWritten: 0,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [closedLoopMetrics.orgId, closedLoopMetrics.date],
      set: {
        groundingRate: fmt(groundingRate),
        featureRecall: fmt(featureRecall),
        outcomeAccuracy: fmt(outcomeAccuracy),
        tracesCount,
        computedAt: new Date(),
      },
    });

  return {
    orgId,
    date: asOfDate,
    groundingRate,
    featureRecall,
    outcomeAccuracy,
    tracesCount,
    feedbackCount: 0,
    memoriesWritten: 0,
  };
};

const STAGNATION_WINDOW_DAYS = 60;
const STAGNATION_EPSILON = 0.005;

const checkStagnation = async (orgId: string): Promise<void> => {
  const series = await database
    .select()
    .from(closedLoopMetrics)
    .where(eq(closedLoopMetrics.orgId, orgId))
    .orderBy(desc(closedLoopMetrics.date))
    .limit(STAGNATION_WINDOW_DAYS);
  if (series.length < STAGNATION_WINDOW_DAYS) {
    return;
  }
  const grounding = series.map((s) => Number(s.groundingRate ?? 0));
  const recall = series.map((s) => Number(s.featureRecall ?? 0));
  const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  if (
    range(grounding) < STAGNATION_EPSILON &&
    range(recall) < STAGNATION_EPSILON
  ) {
    logger.warn("closed-loop stagnation detected", {
      alert: "closed-loop-stagnation",
      orgId,
      windowDays: STAGNATION_WINDOW_DAYS,
      groundingRange: range(grounding),
      recallRange: range(recall),
    });
  }
};

export const measureClosedLoopJob = schedules.task({
  id: "ai-cfo.measure-closed-loop",
  cron: "0 1 * * *",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const since = new Date(now.getTime() - ONE_DAY_MS);
    const asOf = ISO_DATE(since);
    logger.info("measure-closed-loop start", { asOf });

    const orgRows = await database
      .select({ id: organizations.id })
      .from(organizations);
    const summaries: OrgSnapshot[] = [];
    for (const o of orgRows) {
      try {
        const s = await measureClosedLoopForOrg(o.id, since, asOf);
        summaries.push(s);
        await checkStagnation(o.id);
      } catch (err) {
        logger.error("measure-closed-loop org failed", {
          err: err instanceof Error ? err.message : String(err),
          orgId: o.id,
        });
      }
    }
    logger.info("measure-closed-loop done", {
      orgsMeasured: summaries.length,
    });
    return { ok: true, summaries };
  },
});
