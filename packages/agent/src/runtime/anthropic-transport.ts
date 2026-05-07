/**
 * Production AgentTransport: drives Claude (Opus 4.7 by default) via the
 * Claude Agent SDK against our MCP server (apps/mcp).
 *
 * Hook plumbing:
 *   PreToolUse  → mark a wall-clock start time + remember tool input
 *   PostToolUse → push a ToolCallResult with the tool_response
 *
 * The agent runtime (packages/agent/src/runtime/agent.ts) consumes the
 * returned `toolCalls` and feeds them into the `TraceBuffer`, which extracts
 * snapshot/anomaly/flag citation tokens from the response payloads.
 *
 * MCP authentication: the SDK opens an HTTPS connection to `MCP_SERVER_URL`
 * with `Authorization: Bearer ${MCP_BEARER}`. The bearer is resolved by
 * apps/mcp/src/middleware.ts to an `org_id`. Day-3.1 supports two bearer
 * shapes:
 *   - Production: a Clerk JWT bearing the `org_id` claim.
 *   - Test/dev: the literal string `dev:<orgId>`. Cannot reach apps/mcp in
 *     production (`NODE_ENV=production` forbids the dev shortcut).
 *
 * TODO Day-4: replace the static `MCP_BEARER` with a per-run Clerk-minted
 * short-lived JWT. Tracking issue: see apps/mcp/src/middleware.ts header.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentTransport,
  AgentTransportInput,
  AgentTransportOutput,
  ToolCallResult,
} from "./types";

interface AnthropicTransportOptions {
  /** Reasoning effort. Opus 4.7 supports xhigh. Default: high. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Hard USD ceiling per run. Defaults to 5.00. */
  maxBudgetUsd?: number;
  /** Maximum agent turns. Defaults to 12 (plenty for the daily-report task). */
  maxTurns?: number;
  /** MCP bearer token. Defaults to `process.env.MCP_BEARER`. */
  mcpBearer?: string;
  /** Logical name reported to MCP. */
  mcpName?: string;
  /** MCP server URL. Defaults to `process.env.MCP_SERVER_URL`. */
  mcpUrl?: string;
}

interface PendingCall {
  input: unknown;
  startedAt: number;
  tool: string;
}

const stripMcpPrefix = (toolName: string): string => {
  // The SDK exposes MCP tools as `mcp__<server>__<tool>`. We strip the prefix
  // so `harvestIds` and downstream consumers see the bare tool name.
  const parts = toolName.split("__");
  if (parts[0] === "mcp" && parts.length >= 3) {
    return parts.slice(2).join("__");
  }
  return toolName;
};

const STOP_REASON_OK = new Set(["end_turn", "stop_sequence", "max_tokens"]);

export const createAnthropicTransport = (
  options: AnthropicTransportOptions = {}
): AgentTransport => {
  const mcpUrl = options.mcpUrl ?? process.env.MCP_SERVER_URL;
  const mcpBearer = options.mcpBearer ?? process.env.MCP_BEARER;
  const mcpName = options.mcpName ?? "ai-cfo";
  const maxTurns = options.maxTurns ?? 12;
  const maxBudgetUsd = options.maxBudgetUsd ?? 5;
  const effort = options.effort ?? "high";

  return async (input: AgentTransportInput): Promise<AgentTransportOutput> => {
    if (!(mcpUrl && mcpBearer)) {
      throw new Error(
        "anthropicTransport: MCP_SERVER_URL and MCP_BEARER must be set"
      );
    }

    const toolCalls: ToolCallResult[] = [];
    const pending = new Map<string, PendingCall>();

    const preToolUseHook = (
      h: { hook_event_name: string } & Record<string, unknown>
    ) => {
      if (h.hook_event_name === "PreToolUse") {
        pending.set(h.tool_use_id as string, {
          tool: stripMcpPrefix(h.tool_name as string),
          input: h.tool_input,
          startedAt: Date.now(),
        });
      }
      return Promise.resolve({});
    };

    const postToolUseHook = (
      h: { hook_event_name: string } & Record<string, unknown>
    ) => {
      if (h.hook_event_name !== "PostToolUse") {
        return Promise.resolve({});
      }
      const id = h.tool_use_id as string;
      const start = pending.get(id);
      const latencyMs =
        (h.duration_ms as number | undefined) ??
        (start ? Date.now() - start.startedAt : 0);
      toolCalls.push({
        tool: start?.tool ?? stripMcpPrefix(h.tool_name as string),
        input: start?.input ?? h.tool_input,
        output: h.tool_response,
        latencyMs,
      });
      pending.delete(id);
      return Promise.resolve({});
    };

    const q = query({
      prompt: input.userMessage,
      options: {
        systemPrompt: input.systemPrompt,
        model: input.model,
        // Disable all built-in Claude Code tools — only MCP tools allowed.
        tools: [],
        // No filesystem settings sources; SDK isolation mode.
        settingSources: [],
        // No skills.
        skills: [],
        // No session JSONL persisted to disk.
        persistSession: false,
        // Bypass per-tool permission prompts; auth is enforced server-side
        // by apps/mcp's bearer middleware. Each MCP call is RLS-scoped.
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns,
        maxBudgetUsd,
        effort,
        mcpServers: {
          [mcpName]: {
            type: "http",
            url: mcpUrl,
            headers: { Authorization: `Bearer ${mcpBearer}` },
            alwaysLoad: true,
          },
        },
        hooks: {
          // biome-ignore lint/suspicious/noExplicitAny: SDK hook callback type is a wide union
          PreToolUse: [{ hooks: [preToolUseHook as any] }],
          // biome-ignore lint/suspicious/noExplicitAny: SDK hook callback type is a wide union
          PostToolUse: [{ hooks: [postToolUseHook as any] }],
        },
      },
    });

    return await consumeQueryStream(q, toolCalls);
  };
};

const consumeQueryStream = async (
  q: AsyncIterable<unknown>,
  toolCalls: ToolCallResult[]
): Promise<AgentTransportOutput> => {
  let finalMessage = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for await (const msg of q) {
    const m = msg as Record<string, unknown>;
    if (m.type !== "result") {
      continue;
    }
    if (m.subtype === "success") {
      finalMessage = m.result as string;
      const usage = m.usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      inputTokens = usage?.input_tokens;
      outputTokens = usage?.output_tokens;
      const stopReason = m.stop_reason as string | null | undefined;
      if (stopReason && !STOP_REASON_OK.has(stopReason)) {
        throw new Error(
          `anthropicTransport: unexpected stop_reason ${stopReason}`
        );
      }
    } else {
      const errs =
        ((m.errors as string[] | undefined) ?? []).join("; ") ||
        (m.subtype as string);
      throw new Error(`anthropicTransport: ${m.subtype as string} - ${errs}`);
    }
  }

  return { finalMessage, toolCalls, inputTokens, outputTokens };
};

/**
 * Default transport instance. Reads MCP_SERVER_URL + MCP_BEARER at call
 * time. Prefer `createAnthropicTransport(opts)` when you need explicit
 * configuration (tests, smoke scripts).
 */
export const anthropicTransport: AgentTransport = (input) =>
  createAnthropicTransport()(input);
