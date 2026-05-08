# Trigger.dev v3 — deploy and operate

## Per-org cron schedules

The closed-loop jobs in `packages/learning/jobs/index.ts` declare their schedules at the source:

| Job | Cron | Purpose |
| --- | --- | --- |
| `ai-cfo.daily-report-tick`            | `0 * * * *`    | Hourly fan-out to per-org daily report runs whose `org_settings.daily_report_time` matches |
| `ai-cfo.write-memories-from-traces`   | `30 0 * * *`   | Mine yesterday's traces+feedback+outcomes → `agent_memories` (Haiku 4.5 distill) |
| `ai-cfo.measure-closed-loop`          | `0 1 * * *`    | Per-org `closed_loop_metrics` row: grounding_rate / feature_recall / outcome_accuracy |
| `ai-cfo.rebuild-eval-set`             | `0 2 * * 0` Sun | Rebuild `org_eval_set` fixtures from operator-flagged traces |
| `ai-cfo.tune-thresholds`              | `30 2 * * 0` Sun| Bump `org_thresholds` for false-positive feedback |
| `ai-cfo.optimize-prompt`              | manual         | DSPy+GEPA prompt evolution (Day 30+, ADR 0013) |

## Queue priorities

- **Critical** — daily report generation, webhook parse tasks.
- **High** — reconciliation passes.
- **Normal** — closed-loop jobs.
- **Low** — backfill jobs.

Set via Trigger.dev's `concurrencyKey` and queue config in each task definition.

## Deploy

```sh
bunx trigger.dev@latest deploy --env=production
# CLI runs under Node, not Bun (intentional, see ADR 0004).
```

Per-environment deploys are tied to `TRIGGER_PROJECT_REF_DEV` and `TRIGGER_PROJECT_REF_PROD`.

## Observability

- Trigger.dev's run inspector gives us per-step latency and retry history.
- Sentry capture happens via the Trigger.dev integration; errors land in our org's Sentry project.
- Per-org grounding-rate alerts come from `measureClosedLoopJob` writing into `agent_traces` and a Slack webhook on threshold breach.

## On-call

If a job is stuck:
1. Check Trigger.dev run inspector — the step that hung shows the input + the timeout.
2. If the source is a Hookdeck retry queue: drain via Hookdeck UI.
3. If the source is reconciliation finding a `PERIOD_GAP`: check `sync_runs.errors_jsonb` for the offending connector.
4. Don't manually mark runs complete — re-trigger with the same input so the idempotency key dedups against any prior result.
