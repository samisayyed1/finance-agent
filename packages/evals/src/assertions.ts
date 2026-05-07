/**
 * Custom Promptfoo assertions for the AI CFO grounding/feature-recall harness.
 *
 * Each export takes Promptfoo's standard signature (output, context) and returns
 * { pass, score, reason }. The harness runs these per fixture day.
 */

import { type DailyReport, validateGrounding } from "@ai-cfo/agent";

interface AssertContext {
  vars: Record<string, unknown>;
  // Promptfoo passes the full test object too; we only care about `vars`.
}

interface AssertResult {
  pass: boolean;
  reason: string;
  score: number;
}

const NUMERIC_TOKEN_RE = /-?\$?\d[\d,]*(\.\d+)?%?/g;

/**
 * Pass iff every numeric token in `output` appears in the fixture's
 * `citations[].value`. Produces a score = grounded_tokens / total_tokens.
 */
export const groundingRate = (
  output: string,
  context: AssertContext
): AssertResult => {
  const fixture = context.vars.report_md
    ? (context.vars as { fixture?: DailyReport }).fixture
    : undefined;
  // Promptfoo loads the JSON file referenced by `tests[i].file`; its contents
  // appear under context.vars (key: fixture).
  const cited = new Set<string>();
  if (fixture) {
    for (const c of fixture.citations) {
      cited.add(String(c.value).replace(/[\s,$%]/g, ""));
    }
  }
  const tokens = (output.match(NUMERIC_TOKEN_RE) ?? []).map((t) =>
    t.replace(/[\s,$%]/g, "")
  );
  if (tokens.length === 0) {
    return { pass: true, score: 1, reason: "no numeric tokens" };
  }
  const grounded = tokens.filter((t) => cited.has(t)).length;
  const score = grounded / tokens.length;
  return {
    pass: score === 1,
    score,
    reason: `${grounded}/${tokens.length} numeric tokens cited`,
  };
};

/**
 * Pass iff the output mentions every `expected_features[i]` for this fixture.
 * Score = matched_features / expected_features.
 */
export const featureRecall = (
  output: string,
  context: AssertContext
): AssertResult => {
  const fixture = (
    context.vars as { fixture?: DailyReport & { expected_features?: string[] } }
  ).fixture;
  const expected = fixture?.expected_features ?? [];
  if (expected.length === 0) {
    return { pass: true, score: 1, reason: "no expected features" };
  }
  const lower = output.toLowerCase();
  const matched = expected.filter((f) =>
    lower.includes(f.toLowerCase())
  ).length;
  const score = matched / expected.length;
  return {
    pass: score === 1,
    score,
    reason: `${matched}/${expected.length} expected features mentioned`,
  };
};

/**
 * Strict end-to-end gate that re-uses the in-app grounding validator. Useful
 * inside CI to confirm the same code path that ships in production also passes.
 */
export const validateAgainstSchema = (
  _output: string,
  context: AssertContext
): AssertResult => {
  const fixture = (context.vars as { fixture?: DailyReport }).fixture;
  if (!fixture) {
    return { pass: false, score: 0, reason: "fixture missing" };
  }
  const result = validateGrounding(fixture);
  return {
    pass: result.ok,
    score: result.ok ? 1 : 0,
    reason: result.ok
      ? "grounded"
      : `ungrounded: ${result.ungrounded.join(", ")}`,
  };
};
