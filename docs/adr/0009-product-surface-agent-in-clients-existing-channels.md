# ADR 0009 — Product surface: the agent in the operator's existing channels

## Status
Accepted — 2026-05-07

## Context
Operators don't want another dashboard tab. They want the AI CFO to *meet them where they already work*: morning email, Slack channel, WhatsApp on the phone. The dashboard is a diagnostic and trust layer — a place to verify a number when the agent says something surprising — not the daily destination.

## Decision
Push, not pull. The product surface IS:
- **Email** — daily report at the operator's chosen time and timezone (`org_settings.daily_report_time`/`_timezone`), via Resend + React-Email templates rendered by `packages/reports`.
- **Slack** — daily report in the connected channel as Block Kit; `/cfo` slash command and `app_mention` for analyst chat; feedback buttons on every report.
- **WhatsApp** — Twilio-fronted text summaries; for ops who live on their phone.

The web dashboard at `apps/app` exists for: connecting data sources, configuring delivery, drilling into a flag, and reading the audit trail. It is not where the daily story lives.

## Consequences
- All architectural decisions must serve push delivery: messaging idempotency, per-channel delivery_status tracking on `reports`, reaction routing back into `agent_feedback`, content-renderer/transport split (`packages/reports` vs `packages/delivery`).
- The dashboard can stay smaller than competitors who lead with one. We resist scope creep there.
- We accept three delivery integrations to maintain; they are orthogonal and well-typed.
- Removal test (Iron Rule corollary): take the agent out and email becomes static templates — the product makes no sense. ✅
