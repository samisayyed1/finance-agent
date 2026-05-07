/**
 * Unit tests for the production Anthropic transport.
 *
 * The Claude Agent SDK is mocked at the module level so we can drive a
 * deterministic message stream + hook-firing fixture without paying for a
 * live API call. The test asserts:
 *
 *   1. PreToolUse + PostToolUse hooks the SDK gives back to the transport
 *      capture every tool call into `toolCalls` with correct latency, input,
 *      and output.
 *   2. The final `result` message is surfaced as `finalMessage` and the
 *      usage tokens are summed correctly.
 *   3. An error result short-circuits with a thrown Error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

const MCP_REQUIRED_RE = /MCP_SERVER_URL/;
const ERROR_RESULT_RE = /error_during_execution.*rate limited/;

import { createAnthropicTransport } from "../src/runtime/anthropic-transport";
import type { ToolDescriptor } from "../src/runtime/types";

const TOOLS: ToolDescriptor[] = [
  {
    name: "get_daily_snapshot",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_reconciliation_flags",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_anomalies",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_metric_history",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_sync_health",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
];

interface RecordedToolCall {
  durationMs: number;
  input: unknown;
  output: unknown;
  tool: string;
}

/**
 * Build an SDK fixture that fires hooks for the given tool sequence then
 * yields a `result` message with the final assistant text and usage stats.
 */
const buildFixtureQuery = (params: {
  toolCalls: RecordedToolCall[];
  finalText: string;
  inputTokens: number;
  outputTokens: number;
  resultSubtype?: "success" | "error_during_execution";
  errors?: string[];
  stopReason?: string;
}) => {
  return (queryArgs: { prompt: string; options?: Record<string, unknown> }) => {
    const opts = queryArgs.options ?? {};
    const hooks = (opts.hooks ?? {}) as Record<
      string,
      { hooks: Array<(input: unknown) => Promise<unknown>> }[]
    >;

    const fireAllHooks = async (
      event: "PreToolUse" | "PostToolUse",
      payload: Record<string, unknown>
    ) => {
      const matchers = hooks[event] ?? [];
      for (const m of matchers) {
        for (const h of m.hooks) {
          await h({ ...payload, hook_event_name: event });
        }
      }
    };

    return (async function* () {
      for (let i = 0; i < params.toolCalls.length; i++) {
        const call = params.toolCalls[i];
        const tool_use_id = `toolu_${i}`;
        await fireAllHooks("PreToolUse", {
          tool_name: `mcp__ai-cfo__${call.tool}`,
          tool_input: call.input,
          tool_use_id,
        });
        // Tiny await so wall-clock latency falls back when duration_ms is
        // omitted, exercising both code paths.
        await new Promise((r) => setTimeout(r, 1));
        await fireAllHooks("PostToolUse", {
          tool_name: `mcp__ai-cfo__${call.tool}`,
          tool_input: call.input,
          tool_response: call.output,
          tool_use_id,
          duration_ms: call.durationMs,
        });
      }

      if (params.resultSubtype === "error_during_execution") {
        yield {
          type: "result",
          subtype: "error_during_execution",
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          total_cost_usd: 0,
          usage: {},
          modelUsage: {},
          permission_denials: [],
          errors: params.errors ?? ["bad things"],
          uuid: "u",
          session_id: "s",
        };
        return;
      }

      yield {
        type: "result",
        subtype: "success",
        duration_ms: 0,
        duration_api_ms: 0,
        is_error: false,
        num_turns: 1,
        stop_reason: params.stopReason ?? "end_turn",
        total_cost_usd: 0.05,
        result: params.finalText,
        usage: {
          input_tokens: params.inputTokens,
          output_tokens: params.outputTokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
        uuid: "u",
        session_id: "s",
      };
    })();
  };
};

describe("anthropicTransport", () => {
  beforeEach(() => {
    process.env.MCP_SERVER_URL = "http://localhost:9999/mcp";
    process.env.MCP_BEARER = "dev:test-org";
  });
  afterEach(() => {
    mockQuery.mockReset();
  });

  it("captures 5 tool calls via hooks and returns a JSON DailyReport result", async () => {
    const SNAP = "snap-2026-05-07";
    const FLAG = "flag-x";
    const ANOMALY = "anom-y";

    const recorded: RecordedToolCall[] = [
      {
        tool: "get_daily_snapshot",
        input: { date: "2026-05-07" },
        output: {
          snapshot_id: SNAP,
          date: "2026-05-07",
          revenue_net: "100.00",
        },
        durationMs: 42,
      },
      {
        tool: "get_reconciliation_flags",
        input: { date_range: { start: "2026-05-07", end: "2026-05-07" } },
        output: [{ flag_id: FLAG, kind: "ORDER_MISSING_PAYMENT" }],
        durationMs: 31,
      },
      {
        tool: "list_anomalies",
        input: { date: "2026-05-07" },
        output: [
          { anomaly_id: ANOMALY, metric: "revenue_net", severity: "medium" },
        ],
        durationMs: 18,
      },
      {
        tool: "get_metric_history",
        input: { metric: "revenue_net", days: 7 },
        output: { metric: "revenue_net", series: [] },
        durationMs: 12,
      },
      {
        tool: "get_sync_health",
        input: {},
        output: [{ source: "shopify", status: "active" }],
        durationMs: 8,
      },
    ];

    const finalReport = {
      org_id: "11111111-2222-4333-8444-555555555555",
      date: "2026-05-07",
      snapshot_id: SNAP,
    };

    mockQuery.mockImplementation(
      buildFixtureQuery({
        toolCalls: recorded,
        finalText: JSON.stringify(finalReport),
        inputTokens: 1234,
        outputTokens: 567,
      })
    );

    const transport = createAnthropicTransport();
    const out = await transport({
      systemPrompt: "you are CFO",
      userMessage: "go",
      tools: TOOLS,
      invokeTool: () => Promise.resolve({}),
      model: "claude-opus-4-7",
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    expect(out.toolCalls).toHaveLength(5);
    expect(out.toolCalls[0]).toMatchObject({
      tool: "get_daily_snapshot",
      input: { date: "2026-05-07" },
      output: { snapshot_id: SNAP },
      latencyMs: 42,
    });
    expect(out.toolCalls[1].tool).toBe("get_reconciliation_flags");
    expect(out.toolCalls[2].tool).toBe("list_anomalies");
    expect(out.toolCalls[4].tool).toBe("get_sync_health");
    expect(out.finalMessage).toBe(JSON.stringify(finalReport));
    expect(out.inputTokens).toBe(1234);
    expect(out.outputTokens).toBe(567);
  });

  it("forwards bearer + url to the SDK in mcpServers config", async () => {
    mockQuery.mockImplementation(
      buildFixtureQuery({
        toolCalls: [],
        finalText: "{}",
        inputTokens: 0,
        outputTokens: 0,
      })
    );
    const transport = createAnthropicTransport({
      mcpUrl: "https://mcp.example.com/mcp",
      mcpBearer: "dev:abc-org",
    });
    await transport({
      systemPrompt: "p",
      userMessage: "u",
      tools: [],
      invokeTool: () => Promise.resolve({}),
      model: "claude-opus-4-7",
    });
    const args = mockQuery.mock.calls[0][0];
    expect(args.options.mcpServers["ai-cfo"].url).toBe(
      "https://mcp.example.com/mcp"
    );
    expect(args.options.mcpServers["ai-cfo"].headers.Authorization).toBe(
      "Bearer dev:abc-org"
    );
    expect(args.options.permissionMode).toBe("bypassPermissions");
    expect(args.options.tools).toEqual([]);
  });

  it("throws when MCP_SERVER_URL or MCP_BEARER are missing", async () => {
    process.env.MCP_SERVER_URL = "";
    process.env.MCP_BEARER = "";
    const transport = createAnthropicTransport();
    await expect(
      transport({
        systemPrompt: "p",
        userMessage: "u",
        tools: [],
        invokeTool: () => Promise.resolve({}),
        model: "claude-opus-4-7",
      })
    ).rejects.toThrow(MCP_REQUIRED_RE);
  });

  it("throws when SDK reports an error result", async () => {
    mockQuery.mockImplementation(
      buildFixtureQuery({
        toolCalls: [],
        finalText: "",
        inputTokens: 0,
        outputTokens: 0,
        resultSubtype: "error_during_execution",
        errors: ["rate limited", "boom"],
      })
    );
    const transport = createAnthropicTransport();
    await expect(
      transport({
        systemPrompt: "p",
        userMessage: "u",
        tools: [],
        invokeTool: () => Promise.resolve({}),
        model: "claude-opus-4-7",
      })
    ).rejects.toThrow(ERROR_RESULT_RE);
  });
});
