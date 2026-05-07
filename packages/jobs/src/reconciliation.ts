import { runReconciliation } from "@ai-cfo/reconcile";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const dayInputSchema = z.object({
  orgId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const windowInputSchema = z.object({
  orgId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const reconcileDayTask = schemaTask({
  id: "ai-cfo.reconcile-day",
  schema: dayInputSchema,
  run: async ({ orgId, date }) => {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const result = await runReconciliation(orgId, { start, end });
    logger.info("reconcile-day done", { orgId, date, ...result });
    return result;
  },
});

export const reconcileWindowTask = schemaTask({
  id: "ai-cfo.reconcile-window",
  schema: windowInputSchema,
  run: async ({ orgId, from, to }) => {
    const start = new Date(from);
    const end = new Date(to);
    const result = await runReconciliation(orgId, { start, end });
    logger.info("reconcile-window done", { orgId, from, to, ...result });
    return result;
  },
});
