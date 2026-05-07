/**
 * Day-3 daily-report orchestrator. Two Trigger.dev tasks:
 *
 *   `ai-cfo.daily-report-tick`     — runs every hour at :00 UTC, fans out
 *                                    to every org whose
 *                                    `org_settings.daily_report_time` matches
 *                                    the current hour in their timezone.
 *
 *   `ai-cfo.daily-report-for-org`  — does the per-org pipeline:
 *                                    compute → reconcile → agent → render →
 *                                    deliver, gated by org_settings flags.
 *
 * Idempotent by `(org_id, date)`: rerunning regenerates the snapshot and
 * upserts the `reports` row.
 */

import { anthropicTransport, createAgent } from "@ai-cfo/agent";
import {
  database,
  eq,
  organizations,
  orgSettings,
  reports,
} from "@ai-cfo/database";
import { sendEmail, sendSlack } from "@ai-cfo/delivery";
import { computeDailyMetrics } from "@ai-cfo/metrics";
import { runReconciliation } from "@ai-cfo/reconcile";
import { toEmailHtml, toMarkdown, toSlackBlocks } from "@ai-cfo/reports";
import { logger, schedules, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

const TOOL_DESCRIPTORS = [
  {
    name: "get_daily_snapshot",
    description:
      "Return the cent-exact daily metrics snapshot for a given date for the requesting org, plus open-flag count and recent anomalies.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
  },
  {
    name: "get_metric_history",
    description:
      "Return a time series of one metric for the last N days. Each row carries snapshot_id for citation.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string" },
        days: { type: "number" },
        asOf: { type: "string" },
      },
    },
  },
  {
    name: "list_anomalies",
    description:
      "List anomalies on a given date and the prior 7 days. Each row's anomaly_id is the citation token.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
  },
  {
    name: "get_reconciliation_flags",
    description:
      "List reconciliation flags within a date range, optionally filtered by status.",
    parameters: {
      type: "object",
      properties: {
        date_range: {
          type: "object",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
        },
        status: { type: "string" },
      },
    },
  },
  {
    name: "get_sync_health",
    description:
      "Return the sync status of every connected data source for the requesting org.",
    parameters: { type: "object", properties: {} },
  },
];

const orgInputSchema = z.object({
  orgId: z.string().uuid(),
  /** Target date as ISO YYYY-MM-DD (org-local). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const subDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - n);
  return out;
};

/**
 * Convert "HH:MM:SS" + IANA timezone to "is now in this hour for that tz?"
 * boolean. Day-3 implementation uses `Intl.DateTimeFormat` to render the
 * current UTC instant in the org's timezone and compares the hour. Sufficient
 * for hourly-tick gating; precision up to the hour is fine for a 7am send.
 */
const isOrgHourMatching = (
  hhmmss: string,
  timezone: string,
  now: Date
): boolean => {
  const orgHour = Number(hhmmss.split(":")[0]);
  if (!Number.isFinite(orgHour)) {
    return false;
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  if (!hourPart) {
    return false;
  }
  return Number(hourPart.value) === orgHour;
};

const dateInTimezone = (now: Date, timezone: string): string => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA emits YYYY-MM-DD which is what we want.
  return fmt.format(now);
};

export const dailyReportTickTask = schedules.task({
  id: "ai-cfo.daily-report-tick",
  cron: "0 * * * *",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const settingsRows = await database.select().from(orgSettings);
    const orgsToFire = settingsRows.filter((s) =>
      isOrgHourMatching(s.dailyReportTime, s.dailyReportTimezone, now)
    );
    logger.info("daily-report-tick", {
      total: settingsRows.length,
      firing: orgsToFire.length,
      at: now.toISOString(),
    });
    for (const s of orgsToFire) {
      const yesterday = subDays(
        new Date(`${dateInTimezone(now, s.dailyReportTimezone)}T00:00:00Z`),
        1
      );
      try {
        await tasks.trigger("ai-cfo.daily-report-for-org", {
          orgId: s.orgId,
          date: yesterday.toISOString().slice(0, 10),
        });
      } catch (err) {
        logger.warn("daily-report-tick: enqueue failed", {
          err,
          orgId: s.orgId,
        });
      }
    }
    return { fired: orgsToFire.length };
  },
});

export const dailyReportForOrgTask = schemaTask({
  id: "ai-cfo.daily-report-for-org",
  schema: orgInputSchema,
  run: async ({ orgId, date }) => {
    const targetDate = new Date(`${date}T00:00:00.000Z`);

    // 1. Compute metrics for the target date (idempotent).
    const metrics = await computeDailyMetrics({ orgId, date: targetDate });

    // 2. Run reconciliation against the same window (yesterday → today).
    const reconcileResult = await runReconciliation(orgId, {
      start: targetDate,
      end: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000),
    });

    // 3. Lookup org_settings before the agent run — we need the org name
    //    + bearer + channels regardless of whether the LLM path succeeds.
    const settingsRows = await database
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .limit(1);
    const settings = settingsRows[0];
    if (!settings) {
      logger.warn(
        "daily-report-for-org: no org_settings row; skipping delivery",
        { orgId }
      );
      return { ok: false, reason: "no_org_settings" };
    }

    // 4. Agent run via the production Anthropic transport. The transport
    //    reads MCP_SERVER_URL + MCP_BEARER from the environment; the bearer
    //    must encode the orgId (`dev:<orgId>` for non-prod, Clerk JWT for
    //    prod). For Day-3.1 we mint the dev token; the prod replacement
    //    lands when Clerk-JWT minting is wired.
    process.env.MCP_BEARER ??= `dev:${orgId}`;

    const snapshotId = metrics.snapshot_id;
    const model = process.env.ANTHROPIC_AGENT_MODEL ?? "claude-opus-4-7";

    const orgRows = await database
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const orgName = orgRows[0]?.name ?? "your business";

    const agent = createAgent({
      orgId,
      orgName,
      toolDescriptors: TOOL_DESCRIPTORS,
      invokeTool: () => Promise.resolve({}),
      transport: anthropicTransport,
      model,
      persistTrace: true,
    });
    let agentResult: Awaited<ReturnType<typeof agent.run>>;
    try {
      agentResult = await agent.run({ date: targetDate });
    } catch (err) {
      logger.error("daily-report-for-org: agent run failed", { err, orgId });
      return { ok: false, reason: "agent_run_failed" };
    }
    const { report, traceId } = agentResult;

    // 5. Persist the reports row with the rendered content.
    const contentMd = toMarkdown(report);
    await database
      .insert(reports)
      .values({
        orgId,
        date,
        snapshotId,
        promptVersion: "daily-report-v1",
        model,
        contentJsonb: { report, metrics, reconcileResult },
        contentMd,
        deliveryStatus: {},
        aiTraceId: traceId,
      })
      .onConflictDoNothing();

    // 6. Channel-gated delivery.
    let emailDelivery: "skipped" | "sent" | "failed" = "skipped";
    let slackDelivery: "skipped" | "sent" | "failed" = "skipped";

    // Day-3.1: org_settings does not yet carry per-org delivery email; fall
    // back to env. Schema column lands when multi-recipient delivery ships.
    const emailTo = process.env.DAILY_REPORT_EMAIL_TO;
    if (settings.deliveryEmailEnabled && emailTo) {
      try {
        const html = toEmailHtml(report);
        await sendEmail({
          orgId,
          traceId,
          to: emailTo,
          subject: `Daily report — ${date}`,
          html,
        });
        emailDelivery = "sent";
      } catch (err) {
        logger.warn("daily-report-for-org: email delivery failed", {
          err,
          orgId,
        });
        emailDelivery = "failed";
      }
    }

    if (settings.deliverySlackEnabled && settings.slackChannelId) {
      try {
        const blocks = toSlackBlocks(report);
        await sendSlack({
          orgId,
          traceId,
          channel: settings.slackChannelId,
          blocks,
        });
        slackDelivery = "sent";
      } catch (err) {
        logger.warn("daily-report-for-org: slack delivery failed", {
          err,
          orgId,
        });
        slackDelivery = "failed";
      }
    }

    return {
      ok: true,
      orgId,
      date,
      snapshotId,
      traceId,
      revenueGross: metrics.revenue_gross,
      reconcileFlags:
        reconcileResult.orderMissingPayment +
        reconcileResult.paymentWithoutOrder,
      deliveryEmail: emailDelivery,
      deliverySlack: slackDelivery,
    };
  },
});
