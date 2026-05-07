# Closed-loop operations

The closed loop (ADR 0011) needs babysitting until it's running silently.

## Daily — what to glance at

`measureClosedLoopJob` writes a daily snapshot to `agent_traces` with the per-org metrics:

| Metric | What it measures | Healthy direction |
| --- | --- | --- |
| `grounding_rate` | % of numeric tokens cited | ≥ 95%, target 100% |
| `feature_recall` | % of expected drivers mentioned in reports | ≥ 80%, trending up |
| `outcome_accuracy` | of last month's `was_taken=true` recs, what % had `measured_impact_usd` ≥ predicted | ≥ 60%, trending up |

A Slack webhook fires if grounding_rate < 0.95 for any org.

## Weekly — threshold tuning

`tuneThresholdsJob` (Sunday 03:00 UTC) recomputes per-org `org_thresholds`. After it runs, eyeball:
- Are any thresholds wildly different from defaults? Reasonable for a high-volume brand to need tighter z-scores; investigate if a low-volume brand swings widely.
- Is `last_tuned_at` recent? If a job hasn't run in ≥ 14 days, suspect an outage.

## Monthly — prompt evolution

Until DSPy+GEPA lands (Day 30+, ADR 0013): manually review the most-corrected feedback messages per org from `agent_feedback.message`. Edit the system prompt in `packages/agent/src/index.ts`. Bump `prompt_version`. Deploy.

After DSPy+GEPA lands: `optimizePromptJob` runs per-org on demand. Review the proposed prompt diff in the run inspector before promoting it.

## When the loop is broken

If per-org grounding_rate / feature_recall / outcome_accuracy is **flat for 60 days**: the loop is broken. Check:
1. Is `agent_feedback` actually receiving signals? If it's empty, the Slack feedback buttons aren't wired (see `apps/slack/src/handlers/feedback-buttons.ts`).
2. Is `writeMemoriesFromTracesJob` running and producing rows in `agent_memories`?
3. Is the agent's system prompt actually loading retrieved memories at instantiation? Check the `createAgent` call site.
4. Are evals actually running per-org, or is `runPerOrgEval` short-circuiting?

If (4) is the case, the closed loop is just a label on the box. Fix immediately — this is the moat.
