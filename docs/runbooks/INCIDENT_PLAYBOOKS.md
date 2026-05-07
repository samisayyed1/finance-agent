# Incident playbooks

Placeholder. Real playbooks land as we encounter the first real incidents. Until then, here is the on-call thinking model.

## Severity ladder
- **SEV-0** — agent silently lying about numbers. Rare; fix immediately by cutting the agent off and falling back to plain-template emails (deploy a feature flag; runbook TODO).
- **SEV-1** — daily report fails for ≥ 1 org for ≥ 2 hours. Customer-visible.
- **SEV-2** — connector sync stalls but reconciliation fills the gap within a day.
- **SEV-3** — internal-only (eval drift, slow Trigger.dev queue).

## First moves
1. Check Sentry for fresh errors in `apps/mcp`, `apps/api`, `apps/app`, `packages/learning/jobs/`.
2. Check Trigger.dev run inspector for stuck/failed schedules.
3. Check Hookdeck delivery health for the affected source.
4. Check Supabase RLS audit log if a customer reports "I see numbers I shouldn't" — this is SEV-0.

## Communications
- Customer-visible incidents: write a Slack message to the affected org's connected channel from `apps/slack` (manual for now).
- Internal: tag the on-call channel; reference the trace_id of the failing report.

## Postmortem
Within 5 business days of resolution, write a postmortem and an ADR if an architectural change is implied.
