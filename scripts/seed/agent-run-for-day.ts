/**
 * Day-8 Phase 4 helper: invoke the production daily-report agent for a single
 * seeded day and persist the resulting `reports` row.
 *
 * Mirrors the per-org branch of `dailyReportForOrgTask` in
 * `packages/jobs/src/daily-report.ts`, minus delivery (seeding never spams a
 * real Slack channel or mailbox). Sharing instead of importing the Trigger.dev
 * task body keeps this script Bun-friendly: trigger.dev tasks can only be
 * invoked through `tasks.trigger`, which would enqueue rather than run inline.
 *
 * Requires the MCP server (apps/mcp) to be reachable at MCP_SERVER_URL. The
 * caller is responsible for booting it; the docs/runbooks/DEMO_VIDEO_SCRIPT.md
 * spells out the two-terminal flow.
 */

import { anthropicTransport, createAgent } from "@ai-cfo/agent";
import { database, reports } from "@ai-cfo/database";
import { toMarkdown } from "@ai-cfo/reports";

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

export interface AgentRunForDayInput {
  date: Date;
  orgId: string;
  orgName: string;
  snapshotId: string;
}

export type AgentRunForDayResult =
  | {
      ok: true;
      traceId: string;
      reportDate: string;
    }
  | {
      ok: false;
      reason: string;
      error?: string;
    };

export const runAgentForDay = async (
  input: AgentRunForDayInput
): Promise<AgentRunForDayResult> => {
  const dateLabel = input.date.toISOString().slice(0, 10);
  // Mint a dev bearer so the MCP server scopes its RLS-bound tools to the
  // right org. Production wires Clerk JWT minting; the dev shortcut is
  // documented in apps/mcp/src/middleware.ts and is rejected when
  // NODE_ENV=production.
  process.env.MCP_BEARER ??= `dev:${input.orgId}`;

  const model = process.env.ANTHROPIC_AGENT_MODEL ?? "claude-opus-4-7";

  const agent = createAgent({
    orgId: input.orgId,
    orgName: input.orgName,
    toolDescriptors: TOOL_DESCRIPTORS,
    // anthropicTransport drives the real MCP server; invokeTool is unused
    // along that path but the agent runtime contract still requires it.
    invokeTool: () => Promise.resolve({}),
    transport: anthropicTransport,
    model,
    persistTrace: true,
  });

  try {
    const { report, traceId } = await agent.run({ date: input.date });
    const contentMd = toMarkdown(report);
    await database
      .insert(reports)
      .values({
        orgId: input.orgId,
        date: dateLabel,
        snapshotId: input.snapshotId,
        promptVersion: "daily-report-v1",
        model,
        contentJsonb: { report },
        contentMd,
        deliveryStatus: {
          demoSeeded: true,
          seededAt: new Date().toISOString(),
        },
        aiTraceId: traceId,
      })
      .onConflictDoNothing();
    return { ok: true, traceId, reportDate: dateLabel };
  } catch (err) {
    return {
      ok: false,
      reason: "agent_run_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
