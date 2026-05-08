/**
 * Weekly per-org anomaly threshold auto-tuning.
 *
 * Schedule: Sunday 02:30 UTC. For each org_thresholds row, look at the
 * last 90 days of anomalies on that metric AND any operator feedback
 * tied to traces that cited those anomalies. False-positive feedback
 * (signal='negative' on an anomaly trace) bumps the threshold UP by 10%
 * — anomaly was too sensitive. False-negative (operator manually flagged
 * a normal-looking day) is Day-5+ work.
 *
 * Records tune_method='auto_v1' and last_tuned_at on every change.
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
  orgThresholds,
} from "@ai-cfo/database";
import { logger, schedules } from "@trigger.dev/sdk";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FALSE_POSITIVE_BUMP = 1.1;

export const tuneThresholdsForOrg = async (orgId: string, since: Date) => {
  const thresholds = await database
    .select()
    .from(orgThresholds)
    .where(eq(orgThresholds.orgId, orgId));

  if (thresholds.length === 0) {
    return { orgId, tuned: 0 };
  }

  // Pull all negative-signal feedback in the window joined to traces that
  // surfaced anomalies on the metric in question.
  const negFeedback = await database
    .select({
      traceId: agentFeedback.traceId,
    })
    .from(agentFeedback)
    .where(
      and(
        eq(agentFeedback.orgId, orgId),
        eq(agentFeedback.signal, "negative"),
        gte(agentFeedback.createdAt, since)
      )
    );
  if (negFeedback.length === 0) {
    return { orgId, tuned: 0 };
  }
  const traceIds = [...new Set(negFeedback.map((f) => f.traceId))];
  const traces = await database
    .select({
      traceId: agentTraces.traceId,
      output: agentTraces.outputJsonb,
    })
    .from(agentTraces)
    .where(
      and(eq(agentTraces.orgId, orgId), inArray(agentTraces.traceId, traceIds))
    );

  // Per-metric false-positive count (a trace can flag multiple metrics).
  const fpByMetric = new Map<string, number>();
  for (const t of traces) {
    const out = t.output as
      | {
          report?: {
            top_movers?: Array<{ metric?: string }>;
            flags?: Array<{ kind?: string }>;
          };
        }
      | null
      | undefined;
    const metrics = new Set<string>();
    for (const tm of out?.report?.top_movers ?? []) {
      if (tm.metric) {
        metrics.add(tm.metric);
      }
    }
    for (const m of metrics) {
      fpByMetric.set(m, (fpByMetric.get(m) ?? 0) + 1);
    }
  }

  let tuned = 0;
  for (const th of thresholds) {
    const fp = fpByMetric.get(th.metric) ?? 0;
    if (fp === 0) {
      continue;
    }
    const newValue = (Number(th.thresholdValue) * FALSE_POSITIVE_BUMP).toFixed(
      6
    );
    await database
      .update(orgThresholds)
      .set({
        thresholdValue: newValue,
        tuneMethod: "auto_v1",
        lastTunedAt: new Date(),
      })
      .where(eq(orgThresholds.id, th.id));
    tuned++;
    logger.info("threshold bumped (false positives)", {
      orgId,
      metric: th.metric,
      kind: th.thresholdKind,
      from: th.thresholdValue,
      to: newValue,
      fpCount: fp,
    });
  }
  return { orgId, tuned };
};

export const tuneThresholdsJob = schedules.task({
  id: "ai-cfo.tune-thresholds",
  cron: "30 2 * * 0",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const since = new Date(now.getTime() - NINETY_DAYS_MS);
    logger.info("tune-thresholds start", { since: since.toISOString() });
    const orgs = await database
      .select({ id: organizations.id })
      .from(organizations);
    const summaries: Array<{ orgId: string; tuned: number }> = [];
    for (const o of orgs) {
      try {
        summaries.push(await tuneThresholdsForOrg(o.id, since));
      } catch (err) {
        logger.error("tune-thresholds org failed", {
          err: err instanceof Error ? err.message : String(err),
          orgId: o.id,
        });
      }
    }
    logger.info("tune-thresholds done", { summaries });
    return { ok: true, summaries };
  },
});
