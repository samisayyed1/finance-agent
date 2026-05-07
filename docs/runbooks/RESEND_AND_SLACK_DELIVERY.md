# Resend (email) + Slack delivery

Day-3 daily reports ship via Resend (email) and Slack Bolt (per-org workspace install). WhatsApp is stubbed; lands Day-5+.

## Resend setup

1. Sign up at https://resend.com.
2. **Domains → Add domain** for the AI CFO sending domain (e.g. `mail.aicfo.example`). Verify SPF/DKIM/DMARC records as Resend instructs. Until verification completes, sends from this domain bounce.
3. **API keys → Create** with `sending` scope. Paste into `.env.local`:
   ```
   RESEND_API_KEY=re_...
   RESEND_FROM=AI CFO <reports@mail.aicfo.example>
   ```
4. (Optional) Create a Resend webhook for delivery/bounce events; route to `/webhooks/resend` (Day-4 work — not yet wired).

## Slack delivery

Two paths:

### Path A — System token (Day-3 dev fallback)
For local dev we read `SLACK_BOT_TOKEN` directly. Operates as our own bot in any channel it's been invited to. Don't ship to prod.

### Path B — Per-org Slack OAuth (production)
Each operator installs the AI CFO Slack app into their workspace; we get a per-workspace bot token, store it encrypted in `data_connections (source='slack', source_metadata.team_id, encrypted_credentials)`, and `sendSlack` resolves the token from there.

Setup of the Slack platform app:
1. https://api.slack.com/apps → **Create New App → From scratch**.
2. **OAuth & Permissions** → bot scopes: `chat:write`, `channels:read`, `groups:read` (private channels), `im:write` (DMs).
3. **Redirect URLs**: `https://api.<env>.aicfo.example/oauth/slack/callback`.
4. **Install to workspace** internally (so we get our own bot token for Path A).
5. Production: deploy the OAuth callback (Day-4) so operators install via `/settings/connections → Connect Slack`.

Env (per env):
```
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=...                  # Path-A fallback only
```

## Feedback button routing

Daily-report Slack messages embed three buttons whose `action_id` is
`feedback_<positive|negative|correction>_<traceId>`. The Bolt app at
`apps/slack/src/handlers/feedback-buttons.ts`:

1. Parses `signal` + `traceId` from the action_id.
2. Resolves `org_id` by `data_connections.source_metadata.team_id` =
   the Slack team that delivered the message.
3. Calls `@ai-cfo/feedback.recordFeedback({orgId, traceId, signal, channel: 'slack'})`.
4. Posts an ephemeral confirmation.

## Email feedback links

Daily-report emails carry three feedback links:

- `<app-url>/api/feedback/inbound?trace=<id>&signal=positive`
- `…&signal=negative`
- `…&signal=correction`

The handler at `apps/api/app/api/feedback/inbound/route.ts`:
1. Parses query params via Zod.
2. Looks up the `agent_traces` row by `trace_id` to resolve `org_id`. (We don't trust an org_id query param — the link is only valid because we issued the trace for that org.)
3. Calls `recordFeedback({orgId, traceId, signal, channel: 'email'})`.
4. Renders a tiny thank-you HTML page.

## Manual checklist for Sami before Day-3 goes live to a real brand

- [ ] Resend domain verified.
- [ ] `RESEND_API_KEY` and `RESEND_FROM` filled in `.env.local` (and prod env).
- [ ] Slack app created in api.slack.com.
- [ ] `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET` filled (Path-B requires all three).
- [ ] At least one `org_settings` row exists for the test org with the right timezone + delivery flags.
- [ ] `ANTHROPIC_API_KEY` has billing enabled (Opus 4.7 is the default daily-report model).
- [ ] Trigger.dev project created + `trigger.dev deploy` run.
