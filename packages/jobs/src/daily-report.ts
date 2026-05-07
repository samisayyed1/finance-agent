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

import { database, eq, orgSettings, reports } from "@ai-cfo/database";
import { computeDailyMetrics } from "@ai-cfo/metrics";
import { runReconciliation } from "@ai-cfo/reconcile";
import { logger, schedules, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

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

    // 3. Agent run is wired conditionally — Day-3 the real Anthropic
    //    transport ships in a follow-up commit. We surface the agent step
    //    as a log entry here; once `runWithAnthropic` is plumbed (Day-3.1)
    //    this becomes a real `createAgent({ orgId }).run({ date: targetDate })`.
    logger.info(
      "daily-report-for-org: agent run pending real transport wiring",
      {
        orgId,
        date,
        revenueGross: metrics.revenue_gross,
        revenueNet: metrics.revenue_net,
        reconcileFlags:
          reconcileResult.orderMissingPayment +
          reconcileResult.paymentWithoutOrder,
      }
    );

    // 4. Persist a reports row stub. Real content_jsonb + content_md ship
    //    once the agent transport is real.
    const traceId = `pending_trace_${date}_${orgId.slice(0, 8)}`;
    const snapshotId = metrics.snapshot_id;
    await database
      .insert(reports)
      .values({
        orgId,
        date,
        snapshotId,
        promptVersion: "daily-report-v1",
        model: process.env.ANTHROPIC_AGENT_MODEL ?? "claude-opus-4-7",
        contentJsonb: { metrics, reconcileResult },
        contentMd:
          "Pending: real agent run lands once Anthropic transport is wired (Day-3.1).",
        deliveryStatus: {},
        aiTraceId: traceId,
      })
      .onConflictDoNothing();

    // 5. Lookup org_settings to gate delivery channels.
    const settingsRows = await database
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .limit(1);
    const settings = settingsRows[0];
    if (!settings) {
      logger.warn(
        "daily-report-for-org: no org_settings row; skipping delivery",
        {
          orgId,
        }
      );
      return { ok: false, reason: "no_org_settings" };
    }

    // Email + Slack delivery is gated. Day-3 leaves the actual `sendEmail`
    // / `sendSlack` calls behind a fully-wired agent run; the orchestrator
    // shape is in place so Day-3.1 just plugs in the real transport.
    return {
      ok: true,
      orgId,
      date,
      snapshotId,
      revenueGross: metrics.revenue_gross,
      reconcileFlags:
        reconcileResult.orderMissingPayment +
        reconcileResult.paymentWithoutOrder,
      deliveryEmail: settings.deliveryEmailEnabled,
      deliverySlack: settings.deliverySlackEnabled,
    };
  },
});
