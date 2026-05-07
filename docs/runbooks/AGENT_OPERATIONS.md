# Agent operations

How the AI CFO agent is operated and monitored.

## Prompt versioning

Every agent run carries `metadata.prompt_version`. Today's version: `daily-report-v1`. The canonical text lives in `packages/agent/src/prompts/daily-report-v1.md` (and is mirrored as a TS string constant for runtime use; Day-4 we'll derive at build time).

When you change the prompt:
1. Bump the version string (`daily-report-v2`, etc.) in both files.
2. Add a new fixture day under `packages/evals/fixtures/` if the change affects format.
3. Run `bun run test:eval` against the new prompt — grounding rate must hit 100% on fixtures.
4. Ship the new prompt; old `agent_traces` rows are archived under their version, never rewritten.

## Model routing

| Use case | Model | Why |
| --- | --- | --- |
| Daily report (current) | `claude-opus-4-7` | Best reasoning under Iron Rule #6's strict grounding requirement. |
| Narrow classifiers (Day-4+) | `claude-haiku-4-5-20251001` | When we add "did the operator's reply confirm or correct?" parsing. |
| Per-org evolved prompts (Day-30+) | varies | DSPy/GEPA can pick a smaller model when the prompt is rich enough. |

`ANTHROPIC_AGENT_MODEL` env var overrides; falls back to `claude-opus-4-7`.

## Grounding rate target

Production target: **>95%** of agent runs pass the grounding validator on first attempt. Below that means the prompt is failing to enforce inline citations and we need to either:
1. Tighten the prompt (more aggressive examples).
2. Reduce model temperature (currently default).
3. Move to a stricter model (Opus → Opus + extended thinking).

## What to do when grounding fails

When `validateGrounding` returns `{ok: false, errors}`:
1. The runtime throws `GroundingValidationError` and **does not deliver the report**. This is the boundary that protects the operator.
2. The error's `errors` array is logged via pino with the offending tokens + field paths.
3. The `daily_report_for_org` task finishes with `{ok: false, reason: "grounding_failed"}`.
4. An on-call alert fires (Day-3.1 wires Sentry capture + Slack notification to engineering). For Day-3 we rely on Trigger.dev's run-failure log.
5. The operator does NOT get a report that day. We accept skipping a day over delivering a fabricated one.

Investigation flow:
- Pull the `agent_traces` row for the run.
- Inspect `output_jsonb.report` and the trace's `snapshot_ids`/`anomaly_ids`/`flag_ids`.
- Replay locally with the same trace data (the validator is pure — `validateGrounding(report, trace)`).
- File a prompt or schema change.

## Per-org grounding rate (closed-loop measurement)

Day-4 will land `measureClosedLoopJob` (already stubbed) that walks `agent_traces` and computes per-org grounding-rate-on-first-attempt and feature-recall. If a brand's grounding rate trends flat for 60 days we alert — the loop is broken.
