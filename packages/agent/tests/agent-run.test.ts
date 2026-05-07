import { describe, expect, it } from "vitest";
import {
  type AgentTransport,
  type AgentTransportInput,
  type AgentTransportOutput,
  createAgent,
  type DailyReport,
  GroundingValidationError,
  type ToolDescriptor,
} from "../src";

const TRACE_ID_PREFIX_RE = /^trace_2026-05-07_/;
const NOT_VALID_JSON_RE = /not valid JSON/;

// A deterministic fake transport: it makes one tool call (`get_daily_snapshot`)
// then emits a JSON DailyReport. This simulates the Anthropic loop without
// depending on the real SDK or network.

const FAKE_TOOLS: ToolDescriptor[] = [
  {
    name: "get_daily_snapshot",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
];

const buildFixtureReport = (
  snapshotId: string,
  flagId: string
): DailyReport => ({
  org_id: "11111111-2222-4333-8444-555555555555",
  date: "2026-05-07",
  snapshot_id: snapshotId,
  headline: {
    metric: "revenue_net",
    value: "$971.00",
    delta_pct: 5.0,
    trend: "up",
    citation: { kind: "snapshot", snapshot_id: snapshotId },
  },
  summary: `Revenue closed at $971.00 [snapshot:${snapshotId}], up 5.0% [snapshot:${snapshotId}].`,
  top_movers: [],
  flags: [
    {
      flag_id: flagId,
      kind: "ORDER_MISSING_PAYMENT",
      severity: "medium",
      narrative: `One order missed a $100.00 [flag:${flagId}] charge.`,
      citation: { kind: "flag", flag_id: flagId },
    },
  ],
  actions: [],
  sync_health: [],
  metadata: {
    model: "fake",
    prompt_version: "fake",
    generated_at: "2026-05-08T07:00:00.000Z",
    trace_id: "to-be-replaced",
  },
});

const makeTransport = (finalReport: DailyReport): AgentTransport => {
  return async (input: AgentTransportInput): Promise<AgentTransportOutput> => {
    const calls: AgentTransportOutput["toolCalls"] = [];
    // Make one tool call per descriptor and report it back.
    for (const tool of input.tools) {
      const t0 = Date.now();
      const out = await input.invokeTool(tool.name, {});
      calls.push({
        tool: tool.name,
        input: {},
        output: out,
        latencyMs: Date.now() - t0,
      });
    }
    return {
      finalMessage: JSON.stringify(finalReport),
      toolCalls: calls,
      inputTokens: 100,
      outputTokens: 50,
    };
  };
};

describe("createAgent.run with mocked transport", () => {
  const SNAPSHOT_ID = "snap-2026-05-07";
  const FLAG_ID = "MISSING_PAY_xyz";

  const invokeTool = (toolName: string, _input: unknown): Promise<unknown> => {
    if (toolName === "get_daily_snapshot") {
      return Promise.resolve({
        snapshot_id: SNAPSHOT_ID,
        date: "2026-05-07",
        revenue_net: "971.00",
        open_flags_count: 1,
        recent_anomalies: [],
      });
    }
    if (toolName === "get_reconciliation_flags") {
      return Promise.resolve([
        { flag_id: FLAG_ID, kind: "ORDER_MISSING_PAYMENT" },
      ]);
    }
    return Promise.resolve({ ok: true });
  };

  it("happy path: schema-valid + grounded → returns report + traceId", async () => {
    const fixtureReport = buildFixtureReport(SNAPSHOT_ID, FLAG_ID);
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      orgName: "Acme",
      toolDescriptors: [
        ...FAKE_TOOLS,
        {
          name: "get_reconciliation_flags",
          description: "fake",
          parameters: { type: "object", properties: {} },
        },
      ],
      invokeTool,
      transport: makeTransport(fixtureReport),
      persistTrace: false,
    });
    const { report, traceId } = await agent.run({
      date: new Date("2026-05-07"),
    });
    expect(report.snapshot_id).toBe(SNAPSHOT_ID);
    expect(traceId).toMatch(TRACE_ID_PREFIX_RE);
    // Runtime stamps trace_id into metadata.
    expect(report.metadata.trace_id).toBe(traceId);
  });

  it("rejects when grounding fails: report cites a snapshot the tools didn't return", async () => {
    const fixtureReport = buildFixtureReport(
      "never-returned-snapshot",
      FLAG_ID
    );
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: [
        ...FAKE_TOOLS,
        {
          name: "get_reconciliation_flags",
          description: "fake",
          parameters: { type: "object", properties: {} },
        },
      ],
      invokeTool,
      transport: makeTransport(fixtureReport),
      persistTrace: false,
    });
    await expect(
      agent.run({ date: new Date("2026-05-07") })
    ).rejects.toBeInstanceOf(GroundingValidationError);
  });

  it("rejects when the final message is not valid JSON", async () => {
    const transport: AgentTransport = async (input) => {
      for (const t of input.tools) {
        await input.invokeTool(t.name, {});
      }
      return { finalMessage: "not json at all", toolCalls: [] };
    };
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: FAKE_TOOLS,
      invokeTool,
      transport,
      persistTrace: false,
    });
    await expect(agent.run({ date: new Date("2026-05-07") })).rejects.toThrow(
      NOT_VALID_JSON_RE
    );
  });

  it("rejects when JSON is valid but doesn't conform to DailyReportSchema", async () => {
    const transport: AgentTransport = async (input) => {
      for (const t of input.tools) {
        await input.invokeTool(t.name, {});
      }
      return {
        finalMessage: JSON.stringify({ totally: "wrong shape" }),
        toolCalls: [],
      };
    };
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: FAKE_TOOLS,
      invokeTool,
      transport,
      persistTrace: false,
    });
    await expect(agent.run({ date: new Date("2026-05-07") })).rejects.toThrow();
  });

  it("strips ```json fences from the final message", async () => {
    const fixtureReport = buildFixtureReport(SNAPSHOT_ID, FLAG_ID);
    const transport: AgentTransport = async (input) => {
      const calls: AgentTransportOutput["toolCalls"] = [];
      for (const t of input.tools) {
        const output = await input.invokeTool(t.name, {});
        calls.push({ tool: t.name, input: {}, output, latencyMs: 1 });
      }
      return {
        finalMessage: `\`\`\`json\n${JSON.stringify(fixtureReport)}\n\`\`\``,
        toolCalls: calls,
      };
    };
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: [
        ...FAKE_TOOLS,
        {
          name: "get_reconciliation_flags",
          description: "fake",
          parameters: { type: "object", properties: {} },
        },
      ],
      invokeTool,
      transport,
      persistTrace: false,
    });
    const { report } = await agent.run({ date: new Date("2026-05-07") });
    expect(report.snapshot_id).toBe(SNAPSHOT_ID);
  });
});
