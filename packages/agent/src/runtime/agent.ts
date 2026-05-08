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
  validateChatGroundingLight,
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
  /**
   * Static memories blob, rendered as-is into the {{MEMORIES}} placeholder.
   * Tests/legacy callers; production sets `memoryProvider` instead so the
   * agent pulls per-run, per-asOf memories from packages/memory.
   */
  memories?: string;
  /**
   * Per-run memory hook. Called at the top of agent.run() with
   * `{orgId, query, asOf}`; the returned memories are formatted as a
   * markdown bullet list and injected into the system prompt's
   * {{MEMORIES}} placeholder. Returning [] is fine — the runtime falls
   * back to "(none yet — first 30 days of new brand)." per the prompt.
   */
  memoryProvider?: (args: {
    orgId: string;
    query: string;
    asOf: Date;
  }) => Promise<RetrievedMemoryView[]>;
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

/**
 * Minimal view of an agent_memories row needed by the prompt renderer.
 * Mirrors `Memory` from @ai-cfo/memory, kept as a structural interface
 * so packages/agent doesn't have to depend on packages/memory.
 */
export interface RetrievedMemoryView {
  confidence: number | null;
  content: string;
  kind: string;
  memoryId: string;
}

export interface RunResult {
  report: DailyReport;
  traceId: string;
}

export interface ChatMessage {
  content: string;
  role: "user" | "assistant";
}

export interface ChatInput {
  messages: ChatMessage[];
}

export interface ChatCitations {
  anomaly_ids: string[];
  flag_ids: string[];
  memory_ids: string[];
  snapshot_ids: string[];
}

export interface ChatResult {
  citations: ChatCitations;
  message: string;
  traceId: string;
}

const DEFAULT_MODEL = process.env.ANTHROPIC_AGENT_MODEL ?? "claude-opus-4-7";
const DEFAULT_PROMPT_VERSION = "daily-report-v1";

const ISO_DATE = (d: Date): string => d.toISOString().slice(0, 10);

const buildSystemPrompt = (args: {
  template: string;
  orgId: string;
  orgName: string;
  connectedSources: string;
  memories: string;
  reportDate: string;
}): string =>
  args.template
    .replaceAll("{{ORG_ID}}", args.orgId)
    .replaceAll("{{ORG_NAME}}", args.orgName)
    .replaceAll("{{CONNECTED_SOURCES}}", args.connectedSources)
    .replaceAll("{{MEMORIES}}", args.memories || "(none yet)")
    .replaceAll("{{REPORT_DATE}}", args.reportDate);

const FENCE_OPEN_RE = /^```(json)?\s*/;
const FENCE_CLOSE_RE = /```\s*$/;

const debugWrite = (msg: string): void => {
  if (process.env.AGENT_DEBUG_RAW === "1") {
    process.stderr.write(msg);
  }
};

const parseAndValidate = (args: {
  finalMessage: string;
  buffer: TraceBuffer;
  meta: {
    model: string;
    promptVersion: string;
    generatedAt: string;
    traceId: string;
  };
}): DailyReport => {
  debugWrite(
    `[agent.run] raw final message:\n${args.finalMessage}\n[agent.run] end raw\n`
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(args.finalMessage));
  } catch (e) {
    throw new Error(
      `agent.run: final message is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  injectMetadata(parsed, args.meta);
  const report = DailyReportSchema.parse(parsed);
  const groundingResult = validateGrounding(report, {
    snapshot_ids: args.buffer.snapshot_ids,
    anomaly_ids: args.buffer.anomaly_ids,
    flag_ids: args.buffer.flag_ids,
    memory_ids: args.buffer.memory_ids,
  });
  if (!groundingResult.ok) {
    debugWrite(
      `[agent.run] grounding errors:\n${JSON.stringify(groundingResult.errors, null, 2)}\n[agent.run] trace ids: snapshot=${JSON.stringify(Array.from(args.buffer.snapshot_ids))} anomaly=${JSON.stringify(Array.from(args.buffer.anomaly_ids))} flag=${JSON.stringify(Array.from(args.buffer.flag_ids))} memory=${JSON.stringify(Array.from(args.buffer.memory_ids))}\n`
    );
    throw new GroundingValidationError(groundingResult.errors);
  }
  return report;
};

const loadMemoriesForRun = async (args: {
  memoryProvider:
    | undefined
    | ((args: {
        orgId: string;
        query: string;
        asOf: Date;
      }) => Promise<RetrievedMemoryView[]>);
  orgId: string;
  orgName: string;
  asOf: Date;
}): Promise<RetrievedMemoryView[]> => {
  if (!args.memoryProvider) {
    return [];
  }
  try {
    return await args.memoryProvider({
      orgId: args.orgId,
      query: `Daily report for ${args.orgName} on ${ISO_DATE(args.asOf)}. Patterns, preferences, corrections, vendor quirks, threshold overrides relevant to this date.`,
      asOf: args.asOf,
    });
  } catch (err) {
    process.stderr.write(
      `agent.run: memoryProvider failed (continuing with no memories): ${err instanceof Error ? err.message : String(err)}\n`
    );
    return [];
  }
};

const renderMemoriesAsBullets = (
  memories: readonly RetrievedMemoryView[]
): string => {
  return memories
    .map((m) => {
      const conf =
        m.confidence === null || m.confidence === undefined
          ? ""
          : ` (confidence ${m.confidence.toFixed(2)})`;
      return `- [${m.kind}] ${m.content}${conf} [memory:${m.memoryId}]`;
    })
    .join("\n");
};

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
      memoryIds: Array.from(args.buffer.memory_ids),
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

// Synced with packages/agent/src/prompts/daily-report-v1.md by hand.
// TODO Day-4: derive at build time from the .md file.
const EMBEDDED_DAILY_REPORT_V1_TEMPLATE = `You are the operating CFO for {{ORG_NAME}}. The database is truth. You never compute numbers — you call MCP tools and explain what they mean.

# Iron rules — non-negotiable
1. Every monetary or percentage token in your output MUST carry an inline citation marker \`[snapshot:<id>]\`, \`[anomaly:<id>]\`, \`[flag:<id>]\`, or \`[memory:<id>]\` from a tool you actually called or a memory delivered at run-start. The grounding validator rejects the output otherwise. The user never sees ungrounded reports.
2. Recommend, never execute. The \`actions\` array carries titles + reasoning + irreversibility; humans approve the irreversible ones.
3. The output must be a single JSON object matching the DailyReport schema below. No prose outside the JSON. Do NOT wrap the JSON in markdown code fences.

# Connected sources
{{CONNECTED_SOURCES}}

When Meta or Google ad-spend data is connected (\`get_daily_snapshot\` returns non-null \`ad_spend\`/\`roas\`/\`blended_mer\`/\`cac\`), \`top_movers\` should include ROAS, MER, CAC, and ad_spend changes — never just revenue alone. Recommendations should consider ad-spend efficiency before suggesting changes to fulfillment or pricing. If ad_spend is up but conversions are flat, that's a campaign-level recommendation, not a fulfillment one.

# Things I have learned about this brand
{{MEMORIES}}

When generating top_movers / flags / actions, factor these memories in:
- If a memory marks a pattern as normal (e.g. "Sunday drops 12% — Sabbath observance"), do NOT flag it as anomalous in the report.
- If a memory states an operator preference, honor it in the actions section (and cite it via [memory:<id>] in the action's reasoning).
- If a memory contains a vendor quirk, reflect it in narrative rather than flagging it.

# Today's task
Produce a complete DailyReport for the date \`{{REPORT_DATE}}\` (org-local timezone). Use these MCP tools to read truth:

- \`get_daily_snapshot(date)\` — the cent-exact metrics row for the date.
- \`get_metric_history(metric, days)\` — last N days of one metric.
- \`list_anomalies(date, severity?)\` — flagged statistical anomalies.
- \`get_reconciliation_flags(date_range, status?)\` — open reconciliation flags.
- \`get_sync_health()\` — connector sync status.

Recommended call order: snapshot → 7-day history for headline metric → anomalies for the day → open reconciliation flags → sync health.

# Output schema (Zod, exact)
The exact runtime schema lives at \`packages/agent/src/contracts/daily-report.ts\`. Reproduced here so you can match it precisely:

\`\`\`ts
type Citation =
  | { kind: 'snapshot'; snapshot_id: string }
  | { kind: 'anomaly';  anomaly_id:  string }
  | { kind: 'flag';     flag_id:     string }
  | { kind: 'memory';   memory_id:   string };

// Canonical metric vocabulary — anything else is rejected by the schema.
type MetricName =
  | 'revenue_gross' | 'revenue_net' | 'revenue_per_order' | 'aov'
  | 'orders' | 'new_customers'
  | 'refunds' | 'refund_rate' | 'fees'
  | 'ad_spend' | 'roas' | 'blended_mer' | 'cac'
  | 'contribution_profit' | 'gross_margin'
  | 'conversions' | 'conversion_value' | 'cpc' | 'ctr';

type Severity = 'low' | 'medium' | 'high';

interface DailyReport {
  org_id: string;            // UUID v4 — copy from {{ORG_ID}} (literally "{{ORG_ID}}")
  date: string;              // YYYY-MM-DD — must equal {{REPORT_DATE}}
  snapshot_id: string;       // copy from get_daily_snapshot.snapshot_id (non-empty)
  headline: {
    metric: MetricName;       // see canonical metric vocabulary below
    value: string;           // PURE money string only — REGEX /^-?\\$?\\d[\\d,]*(\\.\\d{1,2})?$/. NO inline citation markers here. Example: "$3,958.00" — not "$3,958.00 [snapshot:abc]". The structured citation field below is the cite slot.
    delta_pct: number;       // signed % vs 7-day mean. 0 if history empty.
    trend: 'up' | 'down' | 'flat';
    citation: { kind: 'snapshot'; snapshot_id: string };
  };
  summary: string;           // 2-3 sentences. Every numeric token MUST carry inline [snapshot:...] / [flag:...] / [anomaly:...] markers.
  top_movers: Array<{
    metric: MetricName;       // see canonical metric vocabulary below
    value: string;           // PURE money string. NO inline citation markers.
    delta_abs: string;       // PURE money string, signed (e.g. "-$50.00"). NO inline citations.
    delta_pct: number;
    direction: 'positive' | 'negative';
    narrative: string;       // 1 sentence. ALL inline citation markers go HERE, not in value/delta_abs.
    citations: Citation[];   // 1+ items
  }>;                        // 0-4 items. Empty is OK on quiet days.
  flags: Array<{
    flag_id: string;
    kind: 'ORDER_MISSING_PAYMENT' | 'PAYMENT_WITHOUT_ORDER' | 'REFUND_MISMATCH' | 'DUPLICATE_ORDER' | 'FEE_DRIFT' | 'PAYOUT_GAP' | 'PERIOD_GAP' | 'ATTRIBUTION_MISMATCH';
    severity: 'low' | 'medium' | 'high';
    narrative: string;
    citation: { kind: 'flag'; flag_id: string };
  }>;
  actions: Array<{
    title: string;
    reasoning: string;
    irreversible: boolean;   // true ONLY for actions like "raise refund threshold" / "pause campaign"
    citations: Citation[];   // 1+ items, plural
  }>;                        // 0-3 items.
  sync_health: Array<{
    source: 'shopify' | 'stripe' | 'meta' | 'google' | 'quickbooks' | 'xero' | 'netsuite' | 'plaid';
    status: 'green' | 'yellow' | 'red';
    last_synced_at: string;  // FULL ISO 8601 timestamp like "2026-05-06T14:23:00Z" — NOT a date.
    last_error?: string | null;
  }>;
  metadata: {                // emit empty strings — runtime overwrites
    model: string;
    prompt_version: string;
    generated_at: string;    // ISO 8601 timestamp — runtime overwrites
    trace_id: string;
  };
}
\`\`\`

# Field-by-field guidance
- \`org_id\`: copy verbatim from the get_daily_snapshot response context (you'll see it via the tool result envelope; if you can't find it, copy from the request envelope).
- \`headline\`: revenue_net for an established brand; orders for a new one. Compute \`delta_pct\` from the 7-day history mean: \`(today - mean) / mean * 100\`, signed. If history is empty, use 0 and \`trend: 'flat'\`. Cite the snapshot.
- \`summary\`: 2-3 sentences. EVERY numeric or percentage token MUST carry an inline citation marker.
- \`top_movers\`: 0-4 most-changed metrics vs. yesterday or 7-day mean. Each carries inline citations in its narrative. \`direction\` is the business interpretation, not the sign.
- \`flags\`: surface every open reconciliation flag from \`get_reconciliation_flags\`.
- \`actions\`: 0-3 recommended next moves. Each must reference a citation that justifies it. \`irreversibility: 'high'\` only for actions like "raise refund threshold" or "pause campaign" — most are 'low'.
- \`sync_health\`: copy from \`get_sync_health()\`. Mark \`red\` if last_synced_at > 24h ago.
- \`metadata\`: emit empty strings; the runtime fills them.

# Attribution flags
If \`get_reconciliation_flags\` returns any flag with \`kind = 'ATTRIBUTION_MISMATCH'\`, lead the \`flags\` array with those entries. Each one represents a drift between an ad platform's reported conversions and the orders Shopify attributed via UTM/referring-site. Translate \`source_metadata\` into operator language in the narrative — e.g. "Meta reported 18 conversions on Tue but only 6 Shopify orders carry a Meta UTM (drift 67%)." NEVER recommend campaign changes (pause, scale, rebudget) based on attribution drift alone — recommend an INVESTIGATION action first (Pixel debug, attribution-window check, iOS 14.5+ tracking gap analysis). Mark such actions \`irreversible: false\`.

# Output discipline
- Be terse. The operator's morning attention is the scarcest resource.
- Fewer top_movers and fewer actions is better than fabricated ones. When in doubt, emit empty arrays — the runtime accepts them.
- Citation markers belong INSIDE narrative prose fields (\`summary\`, \`top_movers[].narrative\`, \`flags[].narrative\`, \`actions[].reasoning\`). They do NOT go inside structured \`value\`/\`delta_abs\` money strings — those must match the money regex strictly. The structured \`citation\` / \`citations\` fields are the cite slot for non-prose contexts.

EMIT ONLY THE JSON OBJECT. No prose before or after. No code fences.`;

const EMPTY_CITATIONS = (): ChatCitations => ({
  anomaly_ids: [],
  flag_ids: [],
  memory_ids: [],
  snapshot_ids: [],
});

const POLITE_EMPTY_REPLY =
  "What would you like to know? I can pull metrics, flags, anomalies, or sync health for any date you have data for.";

const DEGRADED_REPLY =
  "I couldn't reach the data layer just now. Try again in a moment, or check the Connections page if this persists.";

const packTranscript = (messages: ChatMessage[]): string =>
  messages
    .map(
      (m) => `${m.role === "user" ? "Operator" : "CFO"}: ${m.content.trim()}`
    )
    .join("\n\n");

const persistChatTrace = async (args: {
  orgId: string;
  traceId: string;
  messages: ChatMessage[];
  result: ChatResult;
  latencyMs: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  model: string;
}): Promise<void> => {
  try {
    await database.insert(agentTraces).values({
      orgId: args.orgId,
      traceId: args.traceId,
      tool: "chat",
      inputJsonb: { messages: args.messages },
      outputJsonb: { message: args.result.message },
      latencyMs: args.latencyMs,
      inputTokens: args.inputTokens ?? null,
      outputTokens: args.outputTokens ?? null,
      snapshotIds: args.result.citations.snapshot_ids,
      anomalyIds: args.result.citations.anomaly_ids,
      flagIds: args.result.citations.flag_ids,
      memoryIds: args.result.citations.memory_ids,
      model: args.model,
      promptVersion: "chat-v1",
    });
  } catch (e) {
    process.stderr.write(
      `agent.chat: trace persist failed: ${e instanceof Error ? e.message : String(e)}\n`
    );
  }
};

// chat-v1 — free-form Q&A system prompt for the /analyst surface. Much
// terser than daily-report-v1: no schema, no required actions array.
// Iron rules echo: still must cite every numeric or percentage claim
// with [snapshot:..]/[flag:..]/[anomaly:..]/[memory:..]; still must
// admit when something is out of scope (no fabrication).
const EMBEDDED_CHAT_V1_TEMPLATE = `You are the operating CFO for {{ORG_NAME}}. The operator is asking a question — answer in plain English, terse, no padding.

# Iron rules
- Every monetary or percentage token in your reply MUST carry an inline citation marker: \`[snapshot:<id>]\`, \`[flag:<id>]\`, \`[anomaly:<id>]\`, or \`[memory:<id>]\`. Use only ids returned by the tools you call (or memory ids delivered at run-start).
- If the question can't be answered from the data you have access to, say so plainly. Do NOT fabricate numbers.
- You may use these MCP tools: get_daily_snapshot, get_metric_history, list_anomalies, get_reconciliation_flags, get_sync_health.
- Recommend, never execute. No automated changes.
- Keep answers under 6 sentences unless the question demands more. Operator attention is scarce.

# Connected sources
{{CONNECTED_SOURCES}}

# Things I have learned about this brand
{{MEMORIES}}

Today's date is {{REPORT_DATE}}. Org id: {{ORG_ID}}.`;

export const createAgent = (
  opts: CreateAgentOptions,
  deps: AgentDeps = { promptTemplate: defaultPromptTemplate() }
) => {
  const orgId = opts.orgId;
  const orgName = opts.orgName ?? "your business";
  const model = opts.model ?? DEFAULT_MODEL;
  const promptVersion = opts.promptVersion ?? DEFAULT_PROMPT_VERSION;
  const staticMemoriesBlob = opts.memories ?? "";
  const memoryProvider = opts.memoryProvider;
  const persistTrace = opts.persistTrace ?? true;
  const now = opts.now ?? (() => new Date());

  const run = async (input: RunInput): Promise<RunResult> => {
    const traceId = `trace_${ISO_DATE(input.date)}_${randomUUID()}`;
    const buffer = new TraceBuffer(traceId);
    const startedAt = now();

    // Pull per-run memories from the provider (production wiring), or fall
    // back to the static blob (tests / cold-start orgs). Memory ids are
    // pre-seeded into the trace buffer so the model can cite them via
    // [memory:<id>] markers — the grounding validator won't accept a
    // memory citation that wasn't returned at run-start.
    const retrievedMemories = await loadMemoriesForRun({
      memoryProvider,
      orgId,
      orgName,
      asOf: input.date,
    });
    for (const m of retrievedMemories) {
      buffer.memory_ids.add(m.memoryId);
    }
    const memoriesBlob =
      retrievedMemories.length > 0
        ? renderMemoriesAsBullets(retrievedMemories)
        : staticMemoriesBlob;

    const systemPrompt = buildSystemPrompt({
      template: deps.promptTemplate,
      orgId,
      orgName,
      connectedSources: opts.toolDescriptors.length
        ? opts.toolDescriptors.map((t) => `- ${t.name}`).join("\n")
        : "(none)",
      memories: memoriesBlob,
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

    const report = parseAndValidate({
      finalMessage: transportOutput.finalMessage,
      buffer,
      meta: {
        model,
        promptVersion,
        generatedAt: now().toISOString(),
        traceId,
      },
    });

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

  const buildChatSystemPrompt = async (
    asOf: Date,
    buffer: TraceBuffer
  ): Promise<string> => {
    const retrievedMemories = await loadMemoriesForRun({
      memoryProvider,
      orgId,
      orgName,
      asOf,
    });
    for (const m of retrievedMemories) {
      buffer.memory_ids.add(m.memoryId);
    }
    const memoriesBlob =
      retrievedMemories.length > 0
        ? renderMemoriesAsBullets(retrievedMemories)
        : staticMemoriesBlob;
    return buildSystemPrompt({
      template: EMBEDDED_CHAT_V1_TEMPLATE,
      orgId,
      orgName,
      connectedSources: opts.toolDescriptors.length
        ? opts.toolDescriptors.map((t) => `- ${t.name}`).join("\n")
        : "(none)",
      memories: memoriesBlob,
      reportDate: ISO_DATE(asOf),
    });
  };

  const chat = async (input: ChatInput): Promise<ChatResult> => {
    const asOf = now();
    const traceId = `trace_chat_${ISO_DATE(asOf)}_${randomUUID()}`;
    const buffer = new TraceBuffer(traceId);
    const startedAt = asOf;

    const systemPrompt = await buildChatSystemPrompt(asOf, buffer);

    if (input.messages.length === 0) {
      return {
        citations: EMPTY_CITATIONS(),
        message: POLITE_EMPTY_REPLY,
        traceId,
      };
    }

    let transportOutput: Awaited<ReturnType<typeof opts.transport>>;
    try {
      transportOutput = await opts.transport({
        systemPrompt,
        userMessage: packTranscript(input.messages),
        tools: opts.toolDescriptors,
        invokeTool: opts.invokeTool,
        model,
      });
    } catch (err) {
      process.stderr.write(
        `agent.chat: transport failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      return {
        citations: EMPTY_CITATIONS(),
        message: DEGRADED_REPLY,
        traceId,
      };
    }

    for (const call of transportOutput.toolCalls) {
      buffer.recordInvocation({
        tool: call.tool,
        input: call.input,
        output: call.output,
        latency_ms: call.latencyMs,
      });
    }

    validateChatGroundingLight(transportOutput.finalMessage, {
      snapshot_ids: buffer.snapshot_ids,
      anomaly_ids: buffer.anomaly_ids,
      flag_ids: buffer.flag_ids,
      memory_ids: buffer.memory_ids,
    });

    const result: ChatResult = {
      citations: {
        anomaly_ids: Array.from(buffer.anomaly_ids),
        flag_ids: Array.from(buffer.flag_ids),
        memory_ids: Array.from(buffer.memory_ids),
        snapshot_ids: Array.from(buffer.snapshot_ids),
      },
      message: transportOutput.finalMessage,
      traceId,
    };

    if (persistTrace) {
      await persistChatTrace({
        orgId,
        traceId,
        messages: input.messages,
        result,
        latencyMs: now().getTime() - startedAt.getTime(),
        inputTokens: transportOutput.inputTokens,
        outputTokens: transportOutput.outputTokens,
        model,
      });
    }

    return result;
  };

  return { chat, run };
};
