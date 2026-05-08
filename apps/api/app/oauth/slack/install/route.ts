/**
 * POST /oauth/slack/install
 *
 * Initiates Slack OAuth v2. Mints a CSRF state HMAC and returns the
 * Slack authorize URL the dashboard redirects to.
 */

import { auth } from "@ai-cfo/auth/server";
import { buildOAuthState } from "@ai-cfo/shared";
import { logger } from "../../../lib/logger";

const SLACK_BOT_SCOPES = [
  "chat:write",
  "channels:read",
  "channels:join",
  "im:write",
  "users:read",
  "users:read.email",
] as const;

const apiBase = (): string =>
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3002";

export const POST = async (): Promise<Response> => {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const stateSecret =
    process.env.SLACK_OAUTH_STATE_SECRET ??
    process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  if (!(clientId && stateSecret)) {
    logger.error(
      "initiate/slack: missing SLACK_CLIENT_ID / DATA_CONNECTION_ENCRYPTION_KEY"
    );
    return Response.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const state = await buildOAuthState({
    orgId,
    source: "slack",
    secret: stateSecret,
  });
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_BOT_SCOPES.join(","),
    redirect_uri: `${apiBase()}/oauth/slack/callback`,
    state,
  });
  return Response.json({
    authorizeUrl: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
  });
};

export const slackBotScopes = SLACK_BOT_SCOPES;
