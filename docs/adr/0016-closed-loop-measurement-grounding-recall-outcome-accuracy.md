# ADR 0016 — Closed-loop measurement: grounding, feature recall, outcome accuracy

## Status
Accepted — 2026-05-08

## Context
Iron rule #9 says the per-org closed loop is the moat. A loop that doesn't *measurably* compound isn't a moat — it's a slogan. We need three time-series KPIs per org, written daily, that together answer "is this brand's agent getting smarter about *its* business?":

1. **grounding_rate** — fraction of agent runs whose final report passed the grounding validator (every numeric/percentage carries a citation that was actually returned by a tool call). Healthy operating range: ≥ 0.99. A persistent dip means the model is drifting toward hallucination or the prompt is starving the citation discipline.
2. **feature_recall** — fraction of *expected* features (from `org_eval_set.expected_features`) that show up in the day's report summary / top movers / flags. The eval set is rebuilt weekly from operator-flagged days, so this metric is *operator-defined*, not Anthropic-defined. Defaults to 1.0 when the eval set is empty (cold start).
3. **outcome_accuracy** — among recommendations the operator marked `was_taken`, the fraction with `measured_impact_usd > 0`. The agent's "I told you so" rate, with money attached.

## Decision
Persist all three to a new `closed_loop_metrics` table (one row per `(org_id, date)`). The `measureClosedLoopJob` Trigger.dev task runs daily at 01:00 UTC, computes the row, and upserts. Stagnation alert: if `grounding_rate` *and* `feature_recall` have a 60-day rolling range below ε = 0.005 (i.e. effectively flat), emit a structured pino warn tagged `alert: closed-loop-stagnation`. Ops routes that to Sentry.

## Consequences
- Every brand has a "the agent is getting smarter" chart visible to the operator, not just to us.
- The eval set's strength is bounded by operator engagement: an operator who never clicks 👎 / 💬 gets a permissive `feature_recall = 1.0`. That's intentional — we only learn what we're told.
- The substrate is RLS-isolated; cross-tenant pooling is forbidden (CLAUDE.md #9). Every metric is private to the org it describes.
- Day 4 ships the substrate; the dashboard view that *renders* this comes Day 5+. Until then ops checks via psql.

## Alternatives considered
- **Single composite "agent quality" score.** Rejected — operators don't trust opaque scores, and we lose the diagnostic power of seeing which signal drifted.
- **Weekly cadence.** Rejected — daily catches drift early, and the job is cheap (read-only on traces, one INSERT).

## Related
- ADR 0011 (closed self-improving loop per-org)
- ADR 0008 (Promptfoo for grounding eval)
- `packages/learning/src/jobs/measure-closed-loop.ts`
- `supabase/migrations/20260508120000_closed_loop_metrics.sql`
