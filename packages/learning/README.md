# @ai-cfo/learning

Per-org closed-loop runner. **This is the moat.**

## Five Trigger.dev jobs

1. `writeMemoriesFromTraces` — daily 01:00 UTC. Mines yesterday's `agent_traces` for patterns / preferences / corrections, writes to `agent_memories` via `@ai-cfo/memory`.
2. `rebuildEvalSet` — weekly Sunday 02:00 UTC. Pulls labeled traces from `agent_feedback` + `agent_outcomes` into `org_eval_set`.
3. `tuneThresholds` — weekly Sunday 03:00 UTC. Recomputes per-org z-score / WoW thresholds from labeled history.
4. `optimizePrompt` — monthly, on-demand. Invokes the **DSPy + GEPA** Python sidecar against the org's growing eval set + textual feedback. Writes the evolved prompt to a per-org prompt registry.
5. `measureClosedLoop` — daily 04:00 UTC. Tracks per-org grounding rate, feature recall, outcome accuracy. Alerts if trending flat after 60 days (loop is broken).

## DSPy + GEPA — deferred to Day 30+

The optimisation sidecar is intentionally not ready in Day-0. Stack:
- **DSPy 3.x** (`pip install dspy`) — Stanford NLP / ICLR 2026 Oral.
- **GEPA** (`pip install gepa`) or `dspy.GEPA` optimizer — leverages textual feedback (not just scalar metrics) to evolve prompts. Sample-efficient at 100–500 evals.
- Sidecar lives in `services/optimizer-py/` (TODO).
- TS calls Python via subprocess + JSON-RPC (or HTTP if we move to FastAPI).

This deferral is captured in **ADR 0013**. We get the per-org closed loop running on memory + threshold tuning + eval-set rebuilding first; prompt evolution comes online once we have at least ~3 months of labeled history per org.

## Day-0 status

Each job is a no-op stub that logs its name. Real implementations land in Phase 5+ alongside `@ai-cfo/memory`, `@ai-cfo/feedback`, `@ai-cfo/evals`.
