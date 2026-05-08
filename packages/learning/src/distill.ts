/**
 * Day-4 distillation: turn yesterday's traces + feedback + outcomes into
 * structured DistilledMemory rows. Each invocation is one Anthropic
 * Haiku 4.5 call with the org's combined signal as input.
 *
 * Pure-ish: the live Anthropic call is injected as a dependency so unit
 * tests can replay a recorded fixture without spending tokens. Drops
 * items below a confidence floor (0.55) to keep noise out of the
 * compounding loop.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const DistilledMemorySchema = z.object({
  kind: z.enum([
    "pattern",
    "preference",
    "correction",
    "outcome",
    "vendor_quirk",
    "threshold_override",
  ]),
  content: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  source_trace_id: z.string().min(1).optional(),
});
export type DistilledMemory = z.infer<typeof DistilledMemorySchema>;

const DistillerOutputSchema = z.object({
  memories: z.array(DistilledMemorySchema),
});

export interface DistillTrace {
  date: string;
  output_jsonb: unknown;
  trace_id: string;
}
export interface DistillFeedback {
  channel: string;
  message: string | null;
  signal: "positive" | "negative" | "correction";
  trace_id: string;
}
export interface DistillOutcome {
  measured_impact_usd: string | null;
  notes: string | null;
  recommendation_id: string;
  was_taken: boolean | null;
}

export interface DistillInput {
  feedback: DistillFeedback[];
  orgName: string;
  outcomes: DistillOutcome[];
  traces: DistillTrace[];
}

export interface DistillerDeps {
  callModel: (args: {
    systemPrompt: string;
    userMessage: string;
  }) => Promise<string>;
  /** Drop items below this floor. Default 0.55. */
  confidenceFloor?: number;
}

const SYSTEM_PROMPT = `You are an analyst distilling per-brand operating memory for an AI CFO.
You receive a JSON envelope of one operating day for a single brand:
- traces: the agent's daily-report runs (each with snapshot_ids, anomaly_ids, flag_ids referenced)
- feedback: operator reactions (positive / negative / correction) with optional free-text messages
- outcomes: recommendations the operator took or skipped, with measured_impact_usd

Extract durable, brand-specific memories that will help future runs. Categories:
- pattern        — recurring fact about the business ("Tue/Thu peak revenue", "Sunday slow but normal")
- preference     — operator-stated way they want things ("frame deltas in % not $")
- correction     — operator-corrected agent claim ("12% Sunday drop is normal — Sabbath")
- outcome        — measured result of a past recommendation ("pausing the Tue ad set lifted contribution +$340")
- vendor_quirk   — payment/3PL/connector idiosyncrasy ("payouts arrive ~36h after shipment")
- threshold_override — observation that an anomaly threshold should change ("Z-score 2.5 too tight for this brand")

Output ONLY a JSON object with one field 'memories' — an array of:
{
  "kind": "<category>",
  "content": "<one-to-two sentences in plain English; no inline JSON>",
  "confidence": <0..1 float, your honest assessment of durability>,
  "source_trace_id": "<trace_id when the memory came from a single trace, optional>"
}

Rules:
- Confidence < 0.55 will be dropped. Don't guess to fill space.
- Empty array is fine: emit {"memories": []} when nothing durable was learned.
- No external knowledge, no SaaS truisms — only facts about THIS brand from THIS day's signal.
- Don't repeat memories that are already implied by the input being just one day; aim for facts that
  generalize beyond today.
- No PII beyond what the operator explicitly wrote.

Output JSON only. No prose. No code fences.`;

export const createAnthropicDistiller = (
  model = process.env.ANTHROPIC_CLASSIFIER_MODEL ?? "claude-haiku-4-5-20251001"
): DistillerDeps["callModel"] => {
  let client: Anthropic | null = null;
  return async ({ systemPrompt, userMessage }) => {
    if (!client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY not set — distillation requires Anthropic"
        );
      }
      client = new Anthropic({ apiKey });
    }
    const result = await client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = result.content.find((b) => b.type === "text");
    return block?.type === "text" ? block.text : "";
  };
};

const FENCE_OPEN_RE = /^```(json)?\s*/;
const FENCE_CLOSE_RE = /```\s*$/;

const stripFences = (s: string): string => {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(FENCE_OPEN_RE, "")
      .replace(FENCE_CLOSE_RE, "")
      .trim();
  }
  return trimmed;
};

export const distillTracesIntoMemories = async (
  input: DistillInput,
  deps: DistillerDeps
): Promise<DistilledMemory[]> => {
  if (
    input.traces.length === 0 &&
    input.feedback.length === 0 &&
    input.outcomes.length === 0
  ) {
    return [];
  }

  const userMessage = JSON.stringify(
    {
      brand: input.orgName,
      traces: input.traces,
      feedback: input.feedback,
      outcomes: input.outcomes,
    },
    null,
    2
  );

  const raw = await deps.callModel({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return [];
  }
  const result = DistillerOutputSchema.safeParse(parsed);
  if (!result.success) {
    return [];
  }
  const floor = deps.confidenceFloor ?? 0.55;
  return result.data.memories.filter((m) => m.confidence >= floor);
};
