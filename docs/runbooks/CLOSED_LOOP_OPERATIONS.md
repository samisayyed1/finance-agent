# Closed-loop operations

The closed loop (ADR 0011) needs babysitting until it's running silently.

## Daily — what to glance at

`measureClosedLoopJob` (01:00 UTC) writes a daily snapshot to `closed_loop_metrics` with the per-org metrics. ADR 0016 has the full rationale.

| Metric | What it measures | Healthy direction |
| --- | --- | --- |
| `grounding_rate` | fraction of agent runs that passed grounding validation | ≥ 0.99, target 1.00 |
| `feature_recall` | avg fraction of `org_eval_set.expected_features` mentioned in the day's report | ≥ 0.80, trending up; 1.00 if eval set empty (cold start) |
| `outcome_accuracy` | of `was_taken=true` recs, fraction with `measured_impact_usd > 0` | ≥ 0.60, trending up |

Quick query:
```sql
select date, grounding_rate, feature_recall, outcome_accuracy,
       traces_count, feedback_count, memories_written
from public.closed_loop_metrics
where org_id = '<uuid>'
order by date desc
limit 30;
```

Stagnation alert: if `grounding_rate` AND `feature_recall` are flat (range ≤ 0.005) for ≥ 60 consecutive days, the job emits a structured `pino.warn` with `alert: "closed-loop-stagnation"`. Ops routes to Sentry. The loop is broken — start with: is the operator engaging? Are eval-set fixtures present? Did the prompt change yesterday?

## The loop, end-to-end

```
agent.run (daily) ──→ agent_traces row written
        │
        ├─→ Slack/email delivery to operator
        │
        ├─→ operator clicks 👍 / 👎 / 💬 ──→ agent_feedback row
        │                                      │ (correction signal also)
        │                                      ↓
        │                                   writeMemory() inline
        │
        ├─→ measureClosedLoopJob (01:00 UTC) ──→ closed_loop_metrics row
        │
        ├─→ writeMemoriesFromTracesJob (00:30 UTC)
        │      reads last 24h traces+feedback+outcomes
        │      Haiku 4.5 distills patterns/preferences/corrections/...
        │      writeMemory() for each (confidence ≥ 0.55)
        │
        ├─→ rebuildEvalSetJob (Sunday 02:00 UTC)
        │      90-day operator-flagged traces → org_eval_set fixtures
        │      stresses tomorrow's feature_recall on the days operators care about
        │
        └─→ tuneThresholdsJob (Sunday 02:30 UTC)
               90-day false-positive feedback → bump org_thresholds up 10%

NEXT DAY:
agent.run pulls retrieveMemories({orgId, query, asOf=date})
         injects them as bullet list into {{MEMORIES}} placeholder
         model cites them via [memory:<uuid>] markers
         grounding validator accepts memory citations only if returned by a tool
                                or pre-seeded at run-start
```

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
