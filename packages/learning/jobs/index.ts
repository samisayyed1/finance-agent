/**
 * Closed-loop runner jobs (Trigger.dev v3).
 *
 * Day-0: each job is a no-op stub that logs its name. Real implementations
 * land alongside the corresponding readers in @ai-cfo/memory, @ai-cfo/feedback,
 * @ai-cfo/evals, and (Day-30+) the DSPy + GEPA Python sidecar for prompt evolution.
 *
 * Schedules will be configured via Trigger.dev cron declarations once those land.
 */
import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const orgInput = z.object({ orgId: z.string() });

export const writeMemoriesFromTracesJob = schedules.task({
  id: "ai-cfo.write-memories-from-traces",
  cron: "0 1 * * *", // 01:00 UTC daily
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  run: async (payload) => {
    logger.info("write-memories-from-traces stub", {
      triggerTime: payload.timestamp,
    });
    // TODO Phase 5: extract patterns/preferences/corrections from yesterday's
    // agent_traces and write to agent_memories via @ai-cfo/memory.writeMemory.
    return { ok: true };
  },
});

export const rebuildEvalSetJob = schedules.task({
  id: "ai-cfo.rebuild-eval-set",
  cron: "0 2 * * 0", // weekly Sunday 02:00 UTC
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  run: async (payload) => {
    logger.info("rebuild-eval-set stub", { triggerTime: payload.timestamp });
    return { ok: true };
  },
});

export const tuneThresholdsJob = schedules.task({
  id: "ai-cfo.tune-thresholds",
  cron: "0 3 * * 0", // weekly Sunday 03:00 UTC
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  run: async (payload) => {
    logger.info("tune-thresholds stub", { triggerTime: payload.timestamp });
    return { ok: true };
  },
});

export const optimizePromptJob = schemaTask({
  id: "ai-cfo.optimize-prompt",
  schema: orgInput,
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  run: async ({ orgId }) => {
    logger.info(
      "optimize-prompt stub (DSPy+GEPA Python sidecar deferred to Day 30+)",
      {
        orgId,
      }
    );
    return { ok: true };
  },
});

export const measureClosedLoopJob = schedules.task({
  id: "ai-cfo.measure-closed-loop",
  cron: "0 4 * * *", // 04:00 UTC daily
  // biome-ignore lint/suspicious/useAwait: Day-0 stub
  run: async (payload) => {
    logger.info("measure-closed-loop stub", { triggerTime: payload.timestamp });
    return { ok: true };
  },
});
