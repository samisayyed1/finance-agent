/**
 * Custom Promptfoo assertions for the AI CFO grounding/feature-recall harness.
 *
 * Each export takes Promptfoo's standard signature (output, context) and
 * returns { pass, score, reason }. The harness runs these per fixture day.
 *
 * Day-3 note: the canonical `DailyReport` contract changed shape; the eval
 * harness keeps using its older, simpler fixture shape so we don't churn
 * historical fixtures every time the contract evolves. The assertions are
 * self-contained — they don't import from @ai-cfo/agent.
 */

interface AssertContext {
  vars: Record<string, unknown>;
}

interface AssertResult {
  pass: boolean;
  reason: string;
  score: number;
}

interface FixtureCitation {
  value: string | number;
}

interface FixtureLike {
  citations?: FixtureCitation[];
  expected_features?: string[];
}

const NUMERIC_TOKEN_RE = /-?\$?\d[\d,]*(\.\d+)?%?/g;

const fixtureFromContext = (context: AssertContext): FixtureLike => {
  const vars = context.vars as { fixture?: FixtureLike };
  return vars.fixture ?? {};
};

/**
 * Pass iff every numeric token in `output` appears in the fixture's
 * `citations[].value`. Score = grounded_tokens / total_tokens.
 */
export const groundingRate = (
  output: string,
  context: AssertContext
): AssertResult => {
  const fixture = fixtureFromContext(context);
  const cited = new Set<string>();
  for (const c of fixture.citations ?? []) {
    cited.add(String(c.value).replace(/[\s,$%]/g, ""));
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
  const fixture = fixtureFromContext(context);
  const expected = fixture.expected_features ?? [];
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
 * Structural check — fixture has at least one citation. The agent's full
 * grounding validator now takes (report, trace) and lives inside the agent
 * runtime; the eval harness uses this lightweight stand-in.
 */
export const hasCitations = (
  _output: string,
  context: AssertContext
): AssertResult => {
  const fixture = fixtureFromContext(context);
  const has = (fixture.citations?.length ?? 0) > 0;
  return {
    pass: has,
    score: has ? 1 : 0,
    reason: has ? "fixture has citations" : "fixture has no citations",
  };
};
