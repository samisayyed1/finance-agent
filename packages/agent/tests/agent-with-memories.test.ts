/**
 * Day-4: createAgent({memoryProvider}).run() pulls memories at run-start,
 * injects them into the {{MEMORIES}} placeholder, and seeds the trace
 * buffer's memory_ids set so the model can cite [memory:<id>] markers.
 */

import { describe, expect, it, vi } from "vitest";
import {
  type AgentTransport,
  type AgentTransportInput,
  type AgentTransportOutput,
  createAgent,
  type DailyReport,
  type RetrievedMemoryView,
  type ToolDescriptor,
} from "../src";

const TOOLS: ToolDescriptor[] = [
  {
    name: "get_daily_snapshot",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
];

const SNAP = "snap-2026-05-08";
const MEM_PATTERN = "11111111-1111-4111-8111-111111111111";
const MEM_PREFERENCE = "22222222-2222-4222-8222-222222222222";
const MEM_CORRECTION = "33333333-3333-4333-8333-333333333333";

const buildReport = (): DailyReport => ({
  org_id: "11111111-2222-4333-8444-555555555555",
  date: "2026-05-08",
  snapshot_id: SNAP,
  headline: {
    metric: "revenue_net",
    value: "$1,000.00",
    delta_pct: 0,
    trend: "flat",
    citation: { kind: "snapshot", snapshot_id: SNAP },
  },
  summary: `Revenue $1,000.00 [snapshot:${SNAP}]; respecting operator preference for percentage framing [memory:${MEM_PREFERENCE}].`,
  top_movers: [],
  flags: [],
  actions: [
    {
      title: "Hold to operator preference",
      reasoning: `Per [memory:${MEM_PREFERENCE}], operator wants % framing.`,
      irreversible: false,
      citations: [{ kind: "memory", memory_id: MEM_PREFERENCE }],
    },
  ],
  sync_health: [],
  metadata: {
    model: "fake",
    prompt_version: "fake",
    generated_at: "2026-05-09T07:00:00.000Z",
    trace_id: "to-be-replaced",
  },
});

describe("createAgent with memoryProvider", () => {
  it("injects memories into the system prompt and accepts [memory:<id>] citations", async () => {
    let capturedSystemPrompt = "";
    const fakeTransport: AgentTransport = (input: AgentTransportInput) => {
      capturedSystemPrompt = input.systemPrompt;
      const calls: AgentTransportOutput["toolCalls"] = [];
      return Promise.all(
        input.tools.map(async (t) => {
          const out = await input.invokeTool(t.name, {});
          calls.push({ tool: t.name, input: {}, output: out, latencyMs: 1 });
        })
      ).then(() => ({
        finalMessage: JSON.stringify(buildReport()),
        toolCalls: calls,
        inputTokens: 100,
        outputTokens: 50,
      }));
    };

    const memoryProvider = vi.fn(
      async (_args: {
        orgId: string;
        query: string;
        asOf: Date;
      }): Promise<RetrievedMemoryView[]> => [
        {
          memoryId: MEM_PATTERN,
          kind: "pattern",
          content: "Brand has consistent Tuesday-Thursday peak revenue.",
          confidence: 0.82,
        },
        {
          memoryId: MEM_PREFERENCE,
          kind: "preference",
          content: "Operator prefers actions framed as % rather than $.",
          confidence: 0.95,
        },
        {
          memoryId: MEM_CORRECTION,
          kind: "correction",
          content: "Operator clarified Sunday drops are normal Sabbath.",
          confidence: 0.9,
        },
      ]
    );

    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      orgName: "Acme",
      toolDescriptors: TOOLS,
      invokeTool: () =>
        Promise.resolve({ snapshot_id: SNAP, date: "2026-05-08" }),
      transport: fakeTransport,
      memoryProvider,
      persistTrace: false,
    });

    const { report } = await agent.run({ date: new Date("2026-05-08") });

    // memoryProvider was called with the right org + asOf.
    expect(memoryProvider).toHaveBeenCalledTimes(1);
    const call = memoryProvider.mock.calls[0][0];
    expect(call.orgId).toBe("11111111-2222-4333-8444-555555555555");
    expect(call.asOf.toISOString().slice(0, 10)).toBe("2026-05-08");

    // The rendered memories landed in the system prompt.
    expect(capturedSystemPrompt).toContain(
      "# Things I have learned about this brand"
    );
    expect(capturedSystemPrompt).toContain("[pattern]");
    expect(capturedSystemPrompt).toContain("[preference]");
    expect(capturedSystemPrompt).toContain("[correction]");
    expect(capturedSystemPrompt).toContain(`[memory:${MEM_PATTERN}]`);

    // The agent accepted a [memory:<id>] citation that was pre-seeded into
    // the trace buffer (grounding validator passed).
    expect(report.summary).toContain(`[memory:${MEM_PREFERENCE}]`);
  });

  it("falls back to '(none yet)' when memoryProvider returns []", async () => {
    const reportNoMemoryCitations: DailyReport = {
      ...buildReport(),
      summary: `Revenue $1,000.00 [snapshot:${SNAP}]; quiet day.`,
      actions: [],
    };
    let captured = "";
    const transport: AgentTransport = (input) => {
      captured = input.systemPrompt;
      return Promise.resolve({
        finalMessage: JSON.stringify(reportNoMemoryCitations),
        toolCalls: [
          {
            tool: "get_daily_snapshot",
            input: {},
            output: { snapshot_id: SNAP },
            latencyMs: 1,
          },
        ],
        inputTokens: 0,
        outputTokens: 0,
      });
    };
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: TOOLS,
      invokeTool: () => Promise.resolve({}),
      transport,
      memoryProvider: () => Promise.resolve([]),
      persistTrace: false,
    });
    await agent.run({ date: new Date("2026-05-08") });
    expect(captured).toContain("(none yet)");
  });
});
