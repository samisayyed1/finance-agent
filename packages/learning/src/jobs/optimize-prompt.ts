/**
 * Stub: per-org prompt evolution.
 *
 * Day 4 ships the closed-loop substrate (memory writes, distillation,
 * measurement, eval-set rebuild, threshold tuning). DSPy + GEPA-driven
 * prompt evolution sits on Day 30+ — see ADR 0013. Until then, this job
 * is registered as a schemaTask so the surface exists for Trigger.dev
 * deploy listings, but the body is intentionally a no-op.
 */

import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const OptimizePromptInput = z.object({
  orgId: z.string().uuid(),
});

export const optimizePromptJob = schemaTask({
  id: "ai-cfo.optimize-prompt",
  schema: OptimizePromptInput,
  // biome-ignore lint/suspicious/useAwait: deferred per ADR 0013 — body is intentionally no-op
  run: async ({ orgId }) => {
    logger.info(
      "optimize-prompt: deferred per ADR 0013 (DSPy + GEPA Day 30+)",
      {
        orgId,
      }
    );
    return { ok: true, deferred: true };
  },
});
