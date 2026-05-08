import { describe, expect, it } from "vitest";
import {
  type AgentTransport,
  type AgentTransportInput,
  type AgentTransportOutput,
  createAgent,
  type ToolDescriptor,
} from "../src";

const TRACE_PREFIX_RE = /^trace_chat_/;
const POLITE_ASK_RE = /what would you like to know/i;
const DEGRADED_RE = /couldn't reach the data layer/i;

const FAKE_TOOLS: ToolDescriptor[] = [
  {
    name: "get_daily_snapshot",
    description: "fake",
    parameters: { type: "object", properties: {} },
  },
];

const SNAPSHOT_ID = "snap-2026-05-07";

const invokeTool = (toolName: string, _input: unknown): Promise<unknown> => {
  if (toolName === "get_daily_snapshot") {
    return Promise.resolve({
      snapshot_id: SNAPSHOT_ID,
      date: "2026-05-07",
      revenue_net: "971.00",
    });
  }
  return Promise.resolve({ ok: true });
};

const makeTransport = (finalMessage: string): AgentTransport => {
  return async (input: AgentTransportInput): Promise<AgentTransportOutput> => {
    const calls: AgentTransportOutput["toolCalls"] = [];
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
      finalMessage,
      toolCalls: calls,
      inputTokens: 50,
      outputTokens: 25,
    };
  };
};

describe("createAgent.chat", () => {
  it("empty messages array → polite ask without tool calls", async () => {
    let transportInvoked = false;
    const transport: AgentTransport = (_input) => {
      transportInvoked = true;
      return Promise.resolve({
        finalMessage: "ignored",
        toolCalls: [],
      });
    };
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: FAKE_TOOLS,
      invokeTool,
      transport,
      persistTrace: false,
    });

    const result = await agent.chat({ messages: [] });

    expect(transportInvoked).toBe(false);
    expect(result.message).toMatch(POLITE_ASK_RE);
    expect(result.traceId).toMatch(TRACE_PREFIX_RE);
    expect(result.citations.snapshot_ids).toEqual([]);
  });

  it("question with tool-cited answer → returns assistant text and citations", async () => {
    const finalMessage = `Net revenue closed at $971.00 [snapshot:${SNAPSHOT_ID}] on 2026-05-07 [snapshot:${SNAPSHOT_ID}].`;
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: FAKE_TOOLS,
      invokeTool,
      transport: makeTransport(finalMessage),
      persistTrace: false,
    });

    const result = await agent.chat({
      messages: [{ role: "user", content: "What did we do yesterday?" }],
    });

    expect(result.message).toBe(finalMessage);
    expect(result.citations.snapshot_ids).toContain(SNAPSHOT_ID);
    expect(result.traceId).toMatch(TRACE_PREFIX_RE);
  });

  it("transport failure → returns graceful degraded answer", async () => {
    const transport: AgentTransport = () => {
      throw new Error("upstream timeout");
    };
    const agent = createAgent({
      orgId: "11111111-2222-4333-8444-555555555555",
      toolDescriptors: FAKE_TOOLS,
      invokeTool,
      transport,
      persistTrace: false,
    });

    const result = await agent.chat({
      messages: [{ role: "user", content: "What did we do yesterday?" }],
    });

    expect(result.message).toMatch(DEGRADED_RE);
    expect(result.traceId).toMatch(TRACE_PREFIX_RE);
    expect(result.citations.snapshot_ids).toEqual([]);
  });

  it("preserves multi-turn transcript when packing into transport input", async () => {
    let receivedUserMessage = "";
    const transport: AgentTransport = async (input) => {
      receivedUserMessage = input.userMessage;
      for (const t of input.tools) {
        await input.invokeTool(t.name, {});
      }
      return {
        finalMessage: "Ack.",
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
    await agent.chat({
      messages: [
        { role: "user", content: "What was revenue?" },
        { role: "assistant", content: "Net was $971.00 [snapshot:foo]." },
        { role: "user", content: "And refund rate?" },
      ],
    });

    expect(receivedUserMessage).toContain("Operator: What was revenue?");
    expect(receivedUserMessage).toContain("CFO: Net was $971.00");
    expect(receivedUserMessage).toContain("Operator: And refund rate?");
  });
});
