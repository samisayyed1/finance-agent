# ADR 0008 — Promptfoo for grounding and eval harness

## Status
Accepted — 2026-05-07

## Context
Iron Rule #6 says the agent never produces a number that didn't come from a tool call, and every claim cites a snapshot/anomaly/flag id. We need a CI-gateable harness that can: (1) run the agent against fixed fixture days, (2) diff its output against expectations, (3) compute custom metrics like grounding rate and feature recall, (4) run per-org against `org_eval_set` once that table fills.

## Decision
Adopt **Promptfoo** (MIT, YAML-driven). Five fixture days at `packages/evals/fixtures/` covering typical / profit_drop / roas_spike / refund_spike / reconciliation_gap. Custom JS assertions for grounding rate, feature recall, and JSON-schema validity in `packages/evals/src/assertions.ts`. CI gate via `bun run test:eval`.

## Consequences
- Eval is a config, not a script; product folks can edit YAML and add fixtures.
- We get a CI gate on grounding behaviour, not just code shape.
- Promptfoo's per-tenant runs let `packages/learning` build per-org eval reports.
- Dependency on Promptfoo's plugin API for our custom assertions; if that API breaks we'll have to migrate. Low risk given the project's velocity and YAML stability.
