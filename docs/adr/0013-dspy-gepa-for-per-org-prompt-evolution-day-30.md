# ADR 0013 — DSPy + GEPA for per-org prompt evolution, Day 30+

## Status
Accepted — 2026-05-07 (deferred to Day 30+)

## Context
The closed-loop runner (ADR 0011) generates a growing per-org eval set and a stream of textual feedback ("you missed that we always discount on Black Friday", "the COGS line was wrong because it didn't include shipping", etc.). This is the input to *prompt optimisation* — evolving the system prompt for that org so the next month's reports get those things right by default.

Scalar-only prompt optimisers (PE2, OPRO) leave the textual feedback on the table. **GEPA** (Gradient-free Evolutionary Prompt Adaptation, Stanford NLP, ICLR 2026 Oral) uses both scalar metrics and free-text feedback to mutate prompts; it is sample-efficient at 100–500 evals — exactly the regime we'll be in per-org for the first six months.

## Decision
Adopt **DSPy 3.x** with the `dspy.GEPA` optimizer (or standalone `gepa-ai/gepa`). Run as a Python sidecar (`services/optimizer-py/` — TODO) invoked monthly per org from `packages/learning/jobs/optimizePromptJob`. The optimizer reads `org_eval_set` + `agent_feedback.message`, evolves the prompt, and writes the evolved prompt to a per-org prompt registry that `packages/agent.createAgent` reads on instantiation.

**Deferred to Day 30+** — explicitly. We need ~3 months of labeled feedback per org before there is enough signal for GEPA to evolve a meaningful prompt. The TS scaffolding ships in Day-0 (`optimizePromptJob` is a no-op stub); the Python sidecar is added after we have data.

## Consequences
- Prompt evolution is per-org, not global — directly serves Iron Rule #9.
- A Python sidecar is a second runtime to operate. Acceptable: it runs once per org per month, not on the hot path.
- DSPy / GEPA are research-grade tools; we vendor specific commits and pin versions tightly.
- Until Day 30+, prompt updates are manual: edit `packages/agent` system prompt, bump `prompt_version`, redeploy. Captured in `docs/runbooks/CLOSED_LOOP_OPERATIONS.md`.
