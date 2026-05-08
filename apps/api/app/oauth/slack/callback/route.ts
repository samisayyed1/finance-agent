/**
 * GET /oauth/slack/callback
 *
 * Slack OAuth v2 redirect handler. Exchanges code at
 * https://slack.com/api/oauth.v2.access, encrypts the bot token, upserts
 * data_connections (source='slack'), redirects to dashboard.
 */

import { encryptCredential } from "@ai-cfo/connector-shopify";
import { database, dataConnections } from "@ai-cfo/database";
import { verifyOAuthState } from "@ai-cfo/shared";
import { z } from "zod";
import { logger } from "../../../lib/logger";

const SlackTokenResponseSchema = z.object({
  ok: z.boolean(),
  app_id: z.string().optional(),
  authed_user: z
    .object({
      id: z.string(),
      access_token: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional(),
  team: z.object({ id: z.string(), name: z.string() }),
  access_token: z.string(),
  bot_user_id: z.string().optional(),
  scope: z.string(),
  token_type: z.string().optional(),
  enterprise: z
    .object({ id: z.string(), name: z.string() })
    .nullable()
    .optional(),
  error: z.string().optional(),
});

const dashboardBase = (): string =>
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const apiBase = (): string =>
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3002";

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const slackError = url.searchParams.get("error");
  if (slackError) {
    logger.warn(
      { slackError, description: url.searchParams.get("error_description") },
      "slack oauth callback: user-side error"
    );
    return Response.redirect(
      `${dashboardBase()}/settings/connections?source=slack&status=error`,
      302
    );
  }
  if (!(code && state)) {
    return new Response("missing code/state", { status: 400 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const stateSecret =
    process.env.SLACK_OAUTH_STATE_SECRET ??
    process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;

  if (!(clientId && clientSecret && stateSecret && encryptionKey)) {
    logger.error(
      "slack oauth callback: missing SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / DATA_CONNECTION_ENCRYPTION_KEY"
    );
    return new Response("server misconfigured", { status: 503 });
  }

  const verified = await verifyOAuthState({
    state,
    secret: stateSecret,
    expectedSource: "slack",
  });
  if (!verified) {
    logger.warn("slack oauth callback: state verification failed");
    return new Response("state verification failed", { status: 400 });
  }

  let tokenJson: z.infer<typeof SlackTokenResponseSchema>;
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${apiBase()}/oauth/slack/callback`,
    });
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`slack oauth.v2.access ${res.status}`);
    }
    tokenJson = SlackTokenResponseSchema.parse(await res.json());
  } catch (e) {
    logger.error({ err: e }, "slack oauth callback: token exchange failed");
    return new Response("token exchange failed", { status: 502 });
  }
  if (!tokenJson.ok || tokenJson.error) {
    logger.error(
      { error: tokenJson.error },
      "slack oauth callback: oauth.v2.access returned ok=false"
    );
    return new Response("slack rejected token exchange", { status: 502 });
  }

  const encryptedAccessToken = await encryptCredential(
    tokenJson.access_token,
    encryptionKey
  );
  const scopes = tokenJson.scope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await database
    .insert(dataConnections)
    .values({
      orgId: verified.orgId,
      source: "slack",
      status: "active",
      scopes,
      encryptedCredentials: encryptedAccessToken,
      sourceMetadata: {
        team_id: tokenJson.team.id,
        team_name: tokenJson.team.name,
        bot_user_id: tokenJson.bot_user_id ?? null,
        app_id: tokenJson.app_id ?? null,
        authed_user_id: tokenJson.authed_user?.id ?? null,
        installed_at: new Date().toISOString(),
      },
    })
    .onConflictDoUpdate({
      target: [dataConnections.orgId, dataConnections.source],
      set: {
        status: "active",
        scopes,
        encryptedCredentials: encryptedAccessToken,
        sourceMetadata: {
          team_id: tokenJson.team.id,
          team_name: tokenJson.team.name,
          bot_user_id: tokenJson.bot_user_id ?? null,
          app_id: tokenJson.app_id ?? null,
          authed_user_id: tokenJson.authed_user?.id ?? null,
          installed_at: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    });

  return Response.redirect(
    `${dashboardBase()}/settings/connections?source=slack&status=connected`,
    302
  );
};
