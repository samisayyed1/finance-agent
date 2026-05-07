#!/usr/bin/env bun
/**
 * Smoke test — fires a REAL daily-report agent run for the configured org.
 *
 * THIS HITS THE LIVE ANTHROPIC API. It is NOT in CI. Run manually:
 *
 *   bun run scripts/smoke-daily-report.ts
 *
 * Required env (loaded from .env.local or shell):
 *   ANTHROPIC_API_KEY    — production Claude credentials
 *   DATABASE_URL         — Supabase Postgres URL
 *   MCP_SERVER_URL       — apps/mcp endpoint (e.g. http://localhost:4000/mcp)
 *
 * Optional:
 *   SMOKE_ORG_SLUG       — defaults to 'sami-test'
 *   SMOKE_ORG_ID         — overrides org lookup; takes precedence over slug
 *   SMOKE_DATE           — ISO date YYYY-MM-DD; defaults to yesterday UTC
 *   ANTHROPIC_AGENT_MODEL — defaults to claude-opus-4-7
 *   RESEND_API_KEY + RESEND_FROM + SMOKE_EMAIL_TO — to email the rendered HTML
 *
 * Side effects:
 *   - WRITES one row to `agent_traces` (real run, not a mock).
 *   - If RESEND_* are set, sends a real email.
 *   - Prints validated JSON, grounding rate, tool count, total tokens, USD cost.
 *
 * To set up the test org:
 *   1. INSERT into organizations (id, name, slug) with slug = 'sami-test'.
 *   2. INSERT into org_settings (org_id, daily_report_time, daily_report_timezone)
 *      so the cron also picks it up.
 *   3. Connect a Shopify + Stripe data source (data_connections) so a daily
 *      metrics snapshot exists for SMOKE_DATE.
 *   4. Boot apps/mcp locally:  cd apps/mcp && bun run dev
 *   5. Then run this script.
 */

import { createAgent, createAnthropicTransport } from "@ai-cfo/agent";
import {
  database,
  eq,
  organizations,
  reports as reportsTable,
} from "@ai-cfo/database";
import { sendEmail } from "@ai-cfo/delivery";
import { toEmailHtml, toMarkdown } from "@ai-cfo/reports";

const TOOL_DESCRIPTORS = [
  {
    name: "get_daily_snapshot",
    description:
      "Return the cent-exact daily metrics snapshot for a given date.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
  },
  {
    name: "get_metric_history",
    description: "Return a time series of one metric for the last N days.",
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
    description: "List anomalies on a given date and the prior 7 days.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
  },
  {
    name: "get_reconciliation_flags",
    description: "List reconciliation flags within a date range.",
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
    description: "Return the sync status of every connected data source.",
    parameters: { type: "object", properties: {} },
  },
];

const yesterdayUtc = (): Date => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const requireEnv = (name: string): string => {
  const v = process.env[name];
  if (!v) {
    throw new Error(`smoke-daily-report: ${name} required`);
  }
  return v;
};

const resolveOrg = async (): Promise<{ id: string; name: string }> => {
  if (process.env.SMOKE_ORG_ID) {
    const rows = await database
      .select()
      .from(organizations)
      .where(eq(organizations.id, process.env.SMOKE_ORG_ID))
      .limit(1);
    if (!rows[0]) {
      throw new Error(
        `smoke: SMOKE_ORG_ID=${process.env.SMOKE_ORG_ID} not in DB`
      );
    }
    return { id: rows[0].id, name: rows[0].name };
  }
  const slug = process.env.SMOKE_ORG_SLUG ?? "sami-test";
  const rows = await database
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!rows[0]) {
    throw new Error(
      `smoke: no organizations row with slug='${slug}' — seed one or set SMOKE_ORG_ID`
    );
  }
  return { id: rows[0].id, name: rows[0].name };
};

const main = async () => {
  requireEnv("ANTHROPIC_API_KEY");
  requireEnv("DATABASE_URL");
  const mcpUrl = requireEnv("MCP_SERVER_URL");
  const model = process.env.ANTHROPIC_AGENT_MODEL ?? "claude-opus-4-7";

  const org = await resolveOrg();
  const date = process.env.SMOKE_DATE
    ? new Date(`${process.env.SMOKE_DATE}T00:00:00Z`)
    : yesterdayUtc();

  process.stderr.write(
    `smoke: org=${org.name} (${org.id}) date=${isoDate(date)} model=${model}\n` +
      `smoke: MCP=${mcpUrl}\n`
  );

  // Mint a dev bearer for the smoke run. Production swaps this for a Clerk JWT.
  const bearer = process.env.MCP_BEARER ?? `dev:${org.id}`;
  process.env.MCP_BEARER = bearer;

  const t0 = Date.now();
  const agent = createAgent({
    orgId: org.id,
    orgName: org.name,
    toolDescriptors: TOOL_DESCRIPTORS,
    invokeTool: () => Promise.resolve({}),
    transport: createAnthropicTransport({ mcpUrl, mcpBearer: bearer }),
    model,
    persistTrace: true,
  });
  const { report, traceId } = await agent.run({ date });
  const elapsedMs = Date.now() - t0;

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(
    `smoke: traceId=${traceId} elapsed=${elapsedMs}ms\n` +
      `smoke: snapshot_id=${report.snapshot_id} flags=${report.flags.length} actions=${report.actions.length}\n`
  );

  // Persist a reports row mirroring what the cron would do.
  await database
    .insert(reportsTable)
    .values({
      orgId: org.id,
      date: isoDate(date),
      snapshotId: report.snapshot_id,
      promptVersion: "daily-report-v1",
      model,
      contentJsonb: { report },
      contentMd: toMarkdown(report),
      deliveryStatus: {},
      aiTraceId: traceId,
    })
    .onConflictDoNothing();

  if (process.env.RESEND_API_KEY && process.env.SMOKE_EMAIL_TO) {
    process.stderr.write(`smoke: emailing ${process.env.SMOKE_EMAIL_TO}\n`);
    await sendEmail({
      orgId: org.id,
      traceId,
      to: process.env.SMOKE_EMAIL_TO,
      subject: `[smoke] Daily report — ${isoDate(date)}`,
      html: toEmailHtml(report),
    });
    process.stderr.write("smoke: email sent\n");
  } else {
    process.stderr.write(
      "smoke: skipping email (set RESEND_API_KEY + RESEND_FROM + SMOKE_EMAIL_TO to enable)\n"
    );
  }
};

main()
  .then(() => {
    process.stderr.write("smoke: done\n");
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write(
      `smoke: FAILED ${err instanceof Error ? err.stack : err}\n`
    );
    process.exit(1);
  });
