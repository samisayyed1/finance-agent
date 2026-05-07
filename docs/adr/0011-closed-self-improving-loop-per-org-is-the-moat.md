# ADR 0011 — The closed self-improving loop per-org IS the moat

## Status
Accepted — 2026-05-07

## Context
There will be a hundred AI agents that "talk to your finance data" in the next twelve months. Most will share a global prompt and be flat — month 1 = month 12. Our wedge is different: every operator interaction (👍/👎/correction text/outcome confirmation) becomes labeled training data. By month 6, the agent knows that brand's vendors, seasonality, product taxonomy, and cash-flow rhythm better than a new fractional CFO would after a year. That asymmetric switching cost — measured in the operator's frustration of explaining things again — is durable.

## Decision
First-class concerns at the schema and code level:
- `agent_traces` — every tool call logged with snapshot/anomaly/flag ids and prompt version.
- `agent_memories` (vector(1536) + HNSW) — temporal facts about the org, written by the daily memory miner.
- `agent_feedback` — operator signals from Slack/email/dashboard/WhatsApp.
- `agent_outcomes` — was the recommendation taken? what was the measured impact?
- `org_eval_set` — labeled fixtures per org, rebuilt weekly.
- `org_thresholds` — per-org z-score / WoW thresholds, recomputed weekly.
- `packages/learning/jobs/` — Trigger.dev cron tasks that drive the loop.

**Cross-tenant data pooling is FORBIDDEN.** Every closed-loop table has `org_id` + RLS. Reasons: privacy, competitive harm (agencies serve competing brands), legal liability. The trade-off is that small orgs accrue improvements more slowly; we accept that.

## Consequences
- The first 60 days for a new org are still useful but flat — improvement compounds month over month thereafter.
- We must measure the loop. `packages/learning/jobs/measureClosedLoopJob` runs daily; if per-org grounding rate / feature recall / outcome accuracy trends flat after 60 days, the loop is broken — alert.
- DSPy + GEPA prompt evolution (ADR 0013) is the long-arm of this loop; deferred to Day 30+ but the schema is ready.
- Our switching-cost story to investors is not "we have data," it is "we have *your* data on *you* in this exact-shaped form, and you cannot rebuild it elsewhere in less than a year."
