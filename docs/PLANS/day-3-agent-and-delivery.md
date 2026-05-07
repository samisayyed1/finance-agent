# Day-3 — agent + delivery + grounding

Bypass mode (no plan-first); retroactive log of what shipped.

## Phase 0 — preconditions
- ENV check: 1/5 (only `ANTHROPIC_API_KEY` set; `RESEND_API_KEY/RESEND_FROM/SLACK_BOT_TOKEN/SLACK_SIGNING_SECRET` absent — runtime is gated on each).
- 7/7 cumulative tables present (`daily_metrics`, `reconciliation_flags`, `agent_traces`, `agent_memories`, `agent_feedback`, `reports`, `org_settings`).
- Day-2 baseline typecheck clean (39/39).

## Phase 1 — typed contracts
- `packages/agent/src/contracts/daily-report.ts` — Zod-derived `DailyReport`:
  - `headline { metric, value: MoneyString, delta_pct, trend, citation }`
  - `summary` (inline-cited prose)
  - `top_movers[]`, `flags[]`, `actions[]` (recommendations only)
  - `sync_health[]`, `metadata { model, prompt_version, generated_at, trace_id }`
  - Discriminated `Citation` union: snapshot | anomaly | flag.
- The shared surface for the agent (emit), the renderer (read), and the grounding validator.

## Phase 2 — real MCP tools
`apps/mcp/src/tools/index.ts` — replaced 6 Day-0 stubs with real Drizzle reads:

| Tool | Input | Output |
| --- | --- | --- |
| `get_daily_snapshot(date)` | ISO date | `daily_metrics` row + open-flag count + recent (14d) anomalies |
| `get_metric_history(metric, days, asOf?)` | metric enum + window | series `[{date, snapshot_id, value}]` |
| `list_anomalies(date, severity?)` | ISO date + optional sev | anomalies for date + 7 prior |
| `get_reconciliation_flags(date_range, status?)` | window + optional status | flag rows |
| `get_sync_health()` | — | per-source status + last_synced_at |
| `record_feedback(trace_id, signal, ...)` | full feedback shape | inserts `agent_feedback`, returns id |

Bearer-token middleware (`apps/mcp/src/middleware.ts`) resolves `org_id` via Clerk JWT (`@clerk/backend.verifyToken`) in production; accepts `dev:<orgId>` in dev. Each request builds a fresh `McpServer` with `orgId` baked into every tool handler — clean RLS-scoping model with zero thread-local plumbing.

## Phase 3 — agent runtime
`packages/agent/src/runtime/agent.ts` — `createAgent({orgId, ...}).run({date})`:
1. Build system prompt from embedded `daily-report-v1.md` template.
2. Run pluggable transport: production wires Claude Agent SDK + MCP; tests inject a deterministic fake. Each tool call goes through the trace buffer.
3. `JSON.parse` final assistant message (strips ```json fences).
4. Stamp `metadata.{model, prompt_version, generated_at, trace_id}` into the parsed object.
5. Validate with `DailyReportSchema.parse` — schema-fail throws.
6. Run `validateGrounding(report, trace)` — grounding-fail throws `GroundingValidationError`.
7. Persist row to `agent_traces` (skippable for tests via `persistTrace: false`).
8. Return `{report, traceId}`.

The transport seam is the testable boundary. Day-3.1 will wire the real Anthropic SDK; Day-3 ships the seam + 5 fake-transport tests proving the orchestration.

## Phase 4 — grounding validator
`packages/agent/src/grounding/validator.ts`:
- Walks every prose field (`summary`, `top_movers[].narrative`, `flags[].narrative`, `actions[].reasoning`).
- For each numeric token, requires an inline `[snapshot:<id>]` / `[anomaly:<id>]` / `[flag:<id>]` marker within 80 chars after the token.
- Skips numeric tokens *inside* citation markers (markers themselves contain digits).
- Cross-checks every cited id against the trace's `snapshot_ids` / `anomaly_ids` / `flag_ids`.
- Cross-checks every structural citation (`headline.citation`, `top_movers[].citations[]`, `flags[].citation`, `actions[].citations[]`).
- Returns `{ok: true} | {ok: false, errors}`. The runtime turns errors into a `GroundingValidationError` exception.

Pure. 7 tests cover happy path + 6 rejection variants.

## Phase 5 — renderers
`packages/reports/src/{markdown,slack-blocks,email-html}.ts`:
- All three are pure functions that take a `DailyReport` and return string/blocks.
- Each calls `DailyReportSchema.parse(raw)` first — Iron Rule #6 enforced at the renderer boundary. Malformed input → throw, no delivery.
- Slack blocks embed three feedback buttons keyed by `feedback_<signal>_<traceId>`; Email links use `<app-url>/api/feedback/inbound?trace=&signal=`.
- Email HTML escapes user content (XSS-safe).
- Monthly PDF stubbed (Day-5).

16 tests covering schema gate, structural shape, escape behavior, and feedback-link wiring.

## Phase 6 — delivery + feedback
`packages/delivery/src/{resend,slack,whatsapp}.ts`:
- `sendEmail({to, subject, html, traceId, orgId})` — Resend SDK; updates `reports.delivery_status.email`.
- `sendSlack({channel, blocks, traceId, orgId})` — resolves per-org bot token from `data_connections (source='slack')`, falls back to `SLACK_BOT_TOKEN` env in dev. Uses `@slack/web-api`. Updates `reports.delivery_status.slack`.
- `sendWhatsApp` — Day-5 stub.

`packages/feedback/src/index.ts` — real `recordFeedback` and `recordOutcome` that insert rows into `agent_feedback` / `agent_outcomes`.

Inbound feedback:
- `apps/slack/src/handlers/feedback-buttons.ts` — parses `feedback_<signal>_<traceId>` action_id, resolves org by Slack team_id, calls `recordFeedback`.
- `apps/api/app/api/feedback/inbound/route.ts` — handles email-link clickthroughs, looks up org from `agent_traces.trace_id`, calls `recordFeedback`, renders a thank-you page.

## Phase 7 — daily-report cron
`packages/jobs/src/daily-report.ts`:
- `ai-cfo.daily-report-tick` — `cron: "0 * * * *"` — every hour, finds orgs whose `org_settings.daily_report_time` matches the current hour in their `daily_report_timezone`, fans out to `daily-report-for-org`.
- `ai-cfo.daily-report-for-org` — schemaTask for `(orgId, date)`:
  1. `computeDailyMetrics({orgId, date})`
  2. `runReconciliation(orgId, {start, end})`
  3. **agent.run** — wired to log a placeholder Day-3; Day-3.1 plugs in the real Anthropic transport.
  4. Upserts `reports` row with snapshot + reconcile result + a placeholder `content_md`.
  5. Looks up `org_settings`, returns the gating booleans for email/Slack delivery (the actual `sendEmail`/`sendSlack` calls light up Day-3.1 once the agent emits real content).

Tests: 3 tick-gating cases (timezone correctness across UTC/America/New_York/Europe/London/Asia/Tokyo).

## Phase 8 — docs (this file + runbooks)
- `docs/runbooks/AGENT_OPERATIONS.md` — prompt versioning, model routing, grounding-rate target, what to do when grounding fails.
- `docs/runbooks/RESEND_AND_SLACK_DELIVERY.md` — Resend domain verification, Slack OAuth path B, env vars, manual go-live checklist.

## Day-3 vs Day-3.1
This Day-3 commit ships the *substrate* end-to-end: contract → tools → grounding → render → deliver → feedback. The *real Anthropic transport* — the function that actually drives Claude Opus 4.7 with the MCP toolbelt and produces the JSON DailyReport — is an integration that wants live API calls and is split into a Day-3.1 follow-up so the broader build stays mockable. The agent runtime accepts any `AgentTransport`; the production transport is one file away.
