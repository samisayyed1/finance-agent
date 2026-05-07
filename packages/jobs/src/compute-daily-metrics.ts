import { computeDailyMetrics } from "@ai-cfo/metrics";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const inputSchema = z.object({
  orgId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const computeDailyMetricsTask = schemaTask({
  id: "ai-cfo.compute-daily-metrics",
  schema: inputSchema,
  run: async ({ orgId, date }) => {
    const result = await computeDailyMetrics({ orgId, date: new Date(date) });
    logger.info("compute-daily-metrics done", {
      orgId,
      date,
      revenueGross: result.revenue_gross,
      revenueNet: result.revenue_net,
      fees: result.fees,
      orders: result.orders,
    });
    return {
      revenueGross: result.revenue_gross,
      revenueNet: result.revenue_net,
      orders: result.orders,
    };
  },
});
