/**
 * Daily distillation: yesterday's traces + feedback + outcomes → memories.
 *
 * Schedule: 00:30 UTC daily. Reads the last 24h's signal per org with at
 * least one trace, runs Haiku-4.5 distillation, writes the surviving
 * memories via @ai-cfo/memory.writeMemory (which embeds + INSERTs).
 *
 * Idempotent on re-run within the same 24h window: writeMemory always
 * inserts a new row. Day-5+: dedupe via cosine similarity threshold.
 */

import {
  agentFeedback,
  agentOutcomes,
  agentTraces,
  and,
  database,
  eq,
  gte,
  inArray,
  organizations,
} from "@ai-cfo/database";
import { writeMemory } from "@ai-cfo/memory";
import { logger, schedules } from "@trigger.dev/sdk";
import {
  createAnthropicDistiller,
  type DistillerDeps,
  distillTracesIntoMemories,
} from "../distill";

interface RunSummary extends Record<string, unknown> {
  dropped: number;
  orgId: string;
  orgName: string;
  written: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const writeMemoriesFromTracesForOrg = async (
  orgId: string,
  orgName: string,
  since: Date,
  deps: DistillerDeps
): Promise<RunSummary> => {
  const traces = await database
    .select({
      id: agentTraces.id,
      traceId: agentTraces.traceId,
      output: agentTraces.outputJsonb,
      createdAt: agentTraces.createdAt,
    })
    .from(agentTraces)
    .where(
      and(eq(agentTraces.orgId, orgId), gte(agentTraces.createdAt, since))
    );

  if (traces.length === 0) {
    return { orgId, orgName, written: 0, dropped: 0 };
  }

  const traceIds = traces.map((t) => t.traceId);
  const feedback = await database
    .select()
    .from(agentFeedback)
    .where(
      and(
        eq(agentFeedback.orgId, orgId),
        inArray(agentFeedback.traceId, traceIds)
      )
    );
  const outcomes = await database
    .select()
    .from(agentOutcomes)
    .where(
      and(eq(agentOutcomes.orgId, orgId), gte(agentOutcomes.createdAt, since))
    );

  const distilled = await distillTracesIntoMemories(
    {
      orgName,
      traces: traces.map((t) => ({
        trace_id: t.traceId,
        date: t.createdAt.toISOString().slice(0, 10),
        output_jsonb: t.output,
      })),
      feedback: feedback.map((f) => ({
        trace_id: f.traceId,
        signal: f.signal as "positive" | "negative" | "correction",
        message: f.message,
        channel: f.channel,
      })),
      outcomes: outcomes.map((o) => ({
        recommendation_id: o.recommendationId,
        was_taken: o.wasTaken,
        measured_impact_usd: o.measuredImpactUsd,
        notes: o.notes,
      })),
    },
    deps
  );

  let written = 0;
  for (const m of distilled) {
    try {
      await writeMemory({
        orgId,
        kind: m.kind,
        content: m.content,
        sourceTraceId: m.source_trace_id,
        confidence: m.confidence,
      });
      written++;
    } catch (err) {
      logger.warn("writeMemory failed", {
        err: err instanceof Error ? err.message : String(err),
        orgId,
      });
    }
  }
  return {
    orgId,
    orgName,
    written,
    dropped: distilled.length - written,
  };
};

export const writeMemoriesFromTracesJob = schedules.task({
  id: "ai-cfo.write-memories-from-traces",
  cron: "30 0 * * *",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const since = new Date(now.getTime() - ONE_DAY_MS);
    logger.info("write-memories-from-traces start", {
      since: since.toISOString(),
    });

    const orgsWithTraces = await database
      .selectDistinct({
        orgId: agentTraces.orgId,
      })
      .from(agentTraces)
      .where(gte(agentTraces.createdAt, since));

    if (orgsWithTraces.length === 0) {
      logger.info("write-memories-from-traces: no active orgs");
      return { ok: true, summaries: [] as RunSummary[] };
    }

    const orgRows = await database
      .select()
      .from(organizations)
      .where(
        inArray(
          organizations.id,
          orgsWithTraces.map((o) => o.orgId)
        )
      );
    const nameByOrgId = new Map(orgRows.map((o) => [o.id, o.name]));

    const distillerDeps: DistillerDeps = {
      callModel: createAnthropicDistiller(),
    };

    const summaries: RunSummary[] = [];
    for (const o of orgsWithTraces) {
      try {
        const summary = await writeMemoriesFromTracesForOrg(
          o.orgId,
          nameByOrgId.get(o.orgId) ?? "your business",
          since,
          distillerDeps
        );
        summaries.push(summary);
        logger.info("write-memories-from-traces org done", summary);
      } catch (err) {
        logger.error("write-memories-from-traces org failed", {
          err: err instanceof Error ? err.message : String(err),
          orgId: o.orgId,
        });
      }
    }
    return { ok: true, summaries };
  },
});
