import { z } from "zod";

/**
 * Grounding validator. Every numeric token in the agent's final report MUST be
 * cited by at least one snapshot_id, anomaly_id, or flag_id pulled from a tool
 * call. Outputs that fail this check are rejected at the renderer boundary —
 * the renderer never gets to ship them.
 *
 * The Zod schema below enforces structure; a follow-up runtime pass walks the
 * generated `content_md` to confirm every digit substring is also in `citations`.
 */
export const Citation = z.object({
  kind: z.enum(["snapshot", "anomaly", "flag"]),
  id: z.string(),
  /** The actual numeric value being cited, as it will appear in the prose. */
  value: z.union([z.number(), z.string()]),
});
export type Citation = z.infer<typeof Citation>;

export const DailyReport = z.object({
  org_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  snapshot_id: z.string(),
  trace_id: z.string(),
  prompt_version: z.string(),
  model: z.string(),
  content_md: z.string(),
  citations: z.array(Citation),
  recommendations: z
    .array(
      z.object({
        recommendation_id: z.string(),
        action: z.string(),
        rationale: z.string(),
        impact_estimate_usd: z.number().nullable(),
      })
    )
    .default([]),
});
export type DailyReport = z.infer<typeof DailyReport>;

/**
 * Walks the rendered markdown looking for digit clusters; every cluster must
 * appear in `citations[].value` (after string-coercion) for the report to pass.
 *
 * Day-0 returns a structured result; the agent loop will call this before
 * shipping the report and reject ungrounded outputs.
 */
const NUMERIC_TOKEN_RE = /-?\$?\d[\d,]*(\.\d+)?%?/g;

export const validateGrounding = (
  report: DailyReport
): { ok: true } | { ok: false; ungrounded: string[] } => {
  const cited = new Set(
    report.citations.map((c) => String(c.value).replace(/[\s,$%]/g, ""))
  );
  const ungrounded: string[] = [];
  const tokens = report.content_md.match(NUMERIC_TOKEN_RE) ?? [];
  for (const token of tokens) {
    const norm = token.replace(/[\s,$%]/g, "");
    if (!cited.has(norm)) {
      ungrounded.push(token);
    }
  }
  if (ungrounded.length === 0) {
    return { ok: true };
  }
  return { ok: false, ungrounded };
};
