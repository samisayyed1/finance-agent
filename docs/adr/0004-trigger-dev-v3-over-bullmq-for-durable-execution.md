# ADR 0004 — Trigger.dev v3 over BullMQ for durable execution

## Status
Accepted — 2026-05-07

## Context
Closed-loop work in this product is *long, retryable, and AI-shaped*: ingestion backfills, reconciliation passes, daily report generation, memory mining, eval rebuilds, prompt optimisation. We need step-level retries, observable execution, and a queue that survives Redis hiccups.

## Decision
Adopt Trigger.dev v3 as the durable-execution platform. Schedule jobs declaratively (`schedules.task`), use `schemaTask` for typed payloads, and let Trigger.dev handle retries, observability, and the database of run history. No BullMQ, no Redis to operate ourselves.

## Consequences
- Step-level retries and run history come for free; we don't build that.
- Trigger.dev is a managed dependency — outages affect our scheduled work. Mitigated by their SLA and our recon/replay design (everything is idempotent by `event_id`).
- The Trigger.dev CLI runs under Node, not Bun; jobs source-files stay Bun-compatible but `trigger.dev dev` and `trigger.dev deploy` use Node.
- v3 supports AI-native primitives (waitForToken, batch, idempotency keys) that BullMQ does not.
- Closed-loop runners in `packages/learning/jobs/` are direct beneficiaries.
