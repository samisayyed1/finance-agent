/**
 * createAgent({orgId}).run({date}) — the Day-3 agent runtime.
 *
 * Pipeline:
 *   1. Build system prompt from packages/agent/src/prompts/daily-report-v1.md.
 *   2. Connect MCP client to apps/mcp (server URL from env), get tool list.
 *   3. Run the transport loop (production: Claude Agent SDK; tests: fake).
 *      Each tool call goes through the buffered invocation hook so we
 *      capture latency + extracted citation ids.
 *   4. Parse final assistant message as JSON, validate against
 *      DailyReportSchema.
 *   5. Run grounding validator. Reject ungrounded reports loud.
 *   6. Flush the per-run trace to the `agent_traces` table.
 *   7. Return { report, traceId }.
 *
 * Trace persistence is optional (`persistTrace` arg); tests can pass `false`
 * to avoid touching the DB.
 */

import { randomUUID } from "node:crypto";
import { agentTraces, database } from "@ai-cfo/database";
import { type DailyReport, DailyReportSchema } from "../contracts/daily-report";
import {
  GroundingValidationError,
  validateGrounding,
} from "../grounding/validator";
import { TraceBuffer } from "./trace-buffer";
import type { AgentTransport, ToolDescriptor } from "./types";

export interface CreateAgentOptions {
  /**
   * Tool invocation function. Called once per tool the model picks. The
   * runtime wraps it to populate the trace buffer. Production: dispatches
   * to the MCP client. Tests: dispatches to in-memory fakes.
   */
  invokeTool: (toolName: string, input: unknown) => Promise<unknown>;
  /** Memories blob to inject into the system prompt. Day-3 stub: "". */
  memories?: string;
  model?: string;
  /** Override Date.now for deterministic tests. */
  now?: () => Date;
  orgId: string;
  orgName?: string;
  /** When true, write a row into agent_traces on completion. Default true. */
  persistTrace?: boolean;
  promptVersion?: string;
  /**
   * The set of MCP tool descriptors the agent is allowed to call. Production
   * code derives these from the MCP server listing at apps/mcp; tests pass
   * in a fixed list. The runtime is agnostic to the source.
   */
  toolDescriptors: ToolDescriptor[];
  /** Pluggable boundary. Production: Anthropic SDK; tests: replay fixture. */
  transport: AgentTransport;
}

export interface RunInput {
  date: Date;
}

export interface RunResult {
  report: DailyReport;
  traceId: string;
}

const DEFAULT_MODEL = process.env.ANTHROPIC_AGENT_MODEL ?? "claude-opus-4-7";
const DEFAULT_PROMPT_VERSION = "daily-report-v1";

const ISO_DATE = (d: Date): string => d.toISOString().slice(0, 10);

const buildSystemPrompt = (args: {
  template: string;
  orgName: string;
  connectedSources: string;
  memories: string;
  reportDate: string;
}): string =>
  args.template
    .replaceAll("{{ORG_NAME}}", args.orgName)
    .replaceAll("{{CONNECTED_SOURCES}}", args.connectedSources)
    .replaceAll("{{MEMORIES}}", args.memories || "(none yet)")
    .replaceAll("{{REPORT_DATE}}", args.reportDate);

const FENCE_OPEN_RE = /^```(json)?\s*/;
const FENCE_CLOSE_RE = /```\s*$/;

const stripCodeFences = (s: string): string => {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    const inner = trimmed
      .replace(FENCE_OPEN_RE, "")
      .replace(FENCE_CLOSE_RE, "");
    return inner.trim();
  }
  return trimmed;
};

interface AgentDeps {
  promptTemplate: string;
}

const persistAgentTrace = async (args: {
  orgId: string;
  traceId: string;
  date: string;
  report: DailyReport;
  latencyMs: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  buffer: TraceBuffer;
  model: string;
  promptVersion: string;
}): Promise<void> => {
  try {
    await database.insert(agentTraces).values({
      orgId: args.orgId,
      traceId: args.traceId,
      tool: "daily_report",
      inputJsonb: { date: args.date },
      outputJsonb: { report: args.report },
      latencyMs: args.latencyMs,
      inputTokens: args.inputTokens ?? null,
      outputTokens: args.outputTokens ?? null,
      snapshotIds: Array.from(args.buffer.snapshot_ids),
      anomalyIds: Array.from(args.buffer.anomaly_ids),
      flagIds: Array.from(args.buffer.flag_ids),
      model: args.model,
      promptVersion: args.promptVersion,
    });
  } catch (e) {
    process.stderr.write(
      `agent.run: trace persist failed: ${e instanceof Error ? e.message : String(e)}\n`
    );
  }
};

const injectMetadata = (
  parsed: unknown,
  meta: {
    model: string;
    promptVersion: string;
    generatedAt: string;
    traceId: string;
  }
): void => {
  if (typeof parsed !== "object" || parsed === null) {
    return;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.metadata !== "object" || obj.metadata === null) {
    obj.metadata = {};
  }
  const md = obj.metadata as Record<string, unknown>;
  md.model = meta.model;
  md.prompt_version = meta.promptVersion;
  md.generated_at = meta.generatedAt;
  md.trace_id = meta.traceId;
};

const defaultPromptTemplate = (): string => {
  // Embedded at package-build time so consumers don't need a runtime
  // file-read. The .md file under src/prompts is the canonical edit surface.
  return EMBEDDED_DAILY_REPORT_V1_TEMPLATE;
};

// Synced with packages/agent/src/prompts/daily-report-v1.md by hand for now.
// TODO Day-4: derive at build time from the .md file.
const EMBEDDED_DAILY_REPORT_V1_TEMPLATE = `You are the operating CFO for {{ORG_NAME}}. The database is truth. You never compute numbers — you call MCP tools and explain what they mean.

# Iron rules — non-negotiable
1. Every monetary or percentage token in your output MUST carry an inline citation marker [snapshot:<id>], [anomaly:<id>], or [flag:<id>] from a tool you actually called. The grounding validator rejects the output otherwise.
2. Recommend, never execute. Actions carry titles + reasoning + irreversibility; humans approve the irreversible ones.
3. The output must be a single JSON object matching the DailyReport schema. No prose outside the JSON.

# Connected sources
{{CONNECTED_SOURCES}}

# Things I have learned about this brand
{{MEMORIES}}

# Today's task
Produce a complete DailyReport for {{REPORT_DATE}} (org-local timezone).`;

export const createAgent = (
  opts: CreateAgentOptions,
  deps: AgentDeps = { promptTemplate: defaultPromptTemplate() }
) => {
  const orgId = opts.orgId;
  const orgName = opts.orgName ?? "your business";
  const model = opts.model ?? DEFAULT_MODEL;
  const promptVersion = opts.promptVersion ?? DEFAULT_PROMPT_VERSION;
  const memories = opts.memories ?? "";
  const persistTrace = opts.persistTrace ?? true;
  const now = opts.now ?? (() => new Date());

  const run = async (input: RunInput): Promise<RunResult> => {
    const traceId = `trace_${ISO_DATE(input.date)}_${randomUUID()}`;
    const buffer = new TraceBuffer(traceId);
    const startedAt = now();

    const systemPrompt = buildSystemPrompt({
      template: deps.promptTemplate,
      orgName,
      connectedSources: opts.toolDescriptors.length
        ? opts.toolDescriptors.map((t) => `- ${t.name}`).join("\n")
        : "(none)",
      memories,
      reportDate: ISO_DATE(input.date),
    });

    // The transport is the source of truth for what tools were called and
    // with what response (the Anthropic SDK path drives MCP itself, so we
    // can't intercept inline). After the transport returns we feed every
    // call into the trace buffer; harvestIds extracts citation tokens.
    const transportOutput = await opts.transport({
      systemPrompt,
      userMessage: `Produce the DailyReport for ${ISO_DATE(input.date)}.`,
      tools: opts.toolDescriptors,
      invokeTool: opts.invokeTool,
      model,
    });

    for (const call of transportOutput.toolCalls) {
      buffer.recordInvocation({
        tool: call.tool,
        input: call.input,
        output: call.output,
        latency_ms: call.latencyMs,
      });
    }

    // Parse final message → DailyReport. Strip optional fences for
    // model-induced markdown wrapping.
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(transportOutput.finalMessage));
    } catch (e) {
      throw new Error(
        `agent.run: final message is not valid JSON: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    // Inject runtime metadata before schema validation so the model doesn't
    // have to know its own trace_id ahead of time.
    injectMetadata(parsed, {
      model,
      promptVersion,
      generatedAt: now().toISOString(),
      traceId,
    });

    const report = DailyReportSchema.parse(parsed);

    const groundingResult = validateGrounding(report, {
      snapshot_ids: buffer.snapshot_ids,
      anomaly_ids: buffer.anomaly_ids,
      flag_ids: buffer.flag_ids,
    });
    if (!groundingResult.ok) {
      throw new GroundingValidationError(groundingResult.errors);
    }

    if (persistTrace) {
      await persistAgentTrace({
        orgId,
        traceId,
        date: ISO_DATE(input.date),
        report,
        latencyMs: now().getTime() - startedAt.getTime(),
        inputTokens: transportOutput.inputTokens,
        outputTokens: transportOutput.outputTokens,
        buffer,
        model,
        promptVersion,
      });
    }

    return { report, traceId };
  };

  return { run };
};
