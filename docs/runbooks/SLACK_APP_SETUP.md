# Slack app setup

This is what you do once to provision the AI CFO Slack app, before any operator can install it into their workspace.

## 1. Create the Slack app from a manifest

1. Visit https://api.slack.com/apps → **Create New App** → **From a manifest**.
2. Pick a development workspace.
3. Paste the following manifest (YAML):

```yaml
display_information:
  name: AI CFO
  description: Your operating CFO — daily reports, drift alerts, instant questions.
  background_color: "#0a0a0a"
features:
  bot_user:
    display_name: AI CFO
    always_online: true
  slash_commands:
    - command: /cfo
      url: https://YOUR-PROD-API/slack/commands
      description: Ask AI CFO a question about your business
      usage_hint: "yesterday's revenue / why did profit drop / show top movers"
      should_escape: false
oauth_config:
  redirect_urls:
    - https://YOUR-PROD-API/oauth/slack/callback
    - http://localhost:3002/oauth/slack/callback
  scopes:
    bot:
      - chat:write
      - channels:read
      - channels:join
      - im:write
      - users:read
      - users:read.email
settings:
  event_subscriptions:
    request_url: https://YOUR-PROD-API/slack/events
    bot_events:
      - app_mention
      - message.im
  interactivity:
    is_enabled: true
    request_url: https://YOUR-PROD-API/slack/interactions
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

4. Replace `YOUR-PROD-API` with your `NEXT_PUBLIC_API_URL` (e.g. `api.yourdomain.com`). For local development the `localhost:3002` redirect already handles it.
5. **Install to Workspace** in the Slack app dashboard, copy:
   - **Client ID** → `SLACK_CLIENT_ID`
   - **Client Secret** → `SLACK_CLIENT_SECRET`
   - **Signing Secret** (Basic Information → App Credentials) → `SLACK_SIGNING_SECRET`

## 2. .env.local

```
SLACK_CLIENT_ID=<id>
SLACK_CLIENT_SECRET=<secret>
SLACK_SIGNING_SECRET=<signing secret>
# Optional: legacy system bot token for fallback delivery (gated by env below).
# SLACK_BOT_TOKEN=xoxb-...
# DELIVERY_SLACK_FALLBACK_SYSTEM_TOKEN=true
# Optional: dedicated state-secret for the OAuth state HMAC; defaults to
# DATA_CONNECTION_ENCRYPTION_KEY when unset.
# SLACK_OAUTH_STATE_SECRET=<32+ char random>
```

## 3. Operator install flow

1. Operator hits `apps/app/(authenticated)/settings/connections` → **Connect Slack**.
2. Dashboard POSTs `/api/connections/slack/initiate` (or `/oauth/slack/install` directly) → returns `{authorizeUrl}`.
3. Browser redirects to Slack consent screen → operator picks workspace + clicks **Allow**.
4. Slack redirects to `/oauth/slack/callback?code=…&state=…`.
5. Callback verifies state HMAC, exchanges code at `oauth.v2.access`, encrypts the bot token, upserts `data_connections` (source='slack', `source_metadata.team_id`/`team_name`/`bot_user_id`/`authed_user_id`).
6. Daily reports + connection-health DMs now flow through the per-org bot token.

## 4. Distribution

- **Development mode** (default): you can install the app only in your dev workspace and any workspace you've explicitly added as a collaborator. Fine for design-partner cohort if you can pre-add their workspaces.
- **Public Distribution**: enable in the Slack app dashboard → submit for **Slack Marketplace review** for cross-workspace install. Slack's review takes 1–2 weeks. Until approved, public install requires "Direct Install" to each workspace's URL.

## 5. Per-org token vs system fallback

`packages/delivery/src/slack.ts` resolves bot tokens in this order:
1. Explicit `args.botToken` override (test/admin path).
2. Per-org install from `data_connections` (production path).
3. System token from `SLACK_BOT_TOKEN`, *only if* `DELIVERY_SLACK_FALLBACK_SYSTEM_TOKEN=true`.

The fallback is gated because silent fallthrough to a single workspace's token leaks reports across orgs. Day-6 disables it by default. Set the env var only for transitional periods (e.g. backfilling delivery for a brand whose Slack install hasn't completed yet).

## 6. Diagnostics

```sql
select source_metadata
from data_connections
where org_id = '<uuid>' and source = 'slack';
```

```bash
# Trigger a connection-health alert manually (e.g. to test Slack DM path):
trigger.dev cli trigger ai-cfo.connection-health \
  --payload '{"timestamp":"2026-05-08T06:00:00Z"}'
```

If a token revokes (operator uninstalls the app from their workspace), Slack returns `not_authed` / `invalid_auth` on the next post — the `data_connection.status` should flip to `expired` via the connection-health monitor on the next scheduled run.
