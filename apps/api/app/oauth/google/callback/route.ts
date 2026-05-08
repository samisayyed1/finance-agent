/**
 * GET /oauth/google/callback
 *
 * Google Ads OAuth redirect: `?code=…&state=…&scope=…`. Verify HMAC state,
 * exchange code → {access_token, refresh_token}, encrypt the
 * refresh_token (the access_token is short-lived and re-mintable), upsert
 * data_connections, enqueue google-backfill.
 */

import {
  exchangeGoogleAdsCode,
  type GoogleAdsOAuthConfig,
} from "@ai-cfo/connector-google";
import { encryptCredential } from "@ai-cfo/connector-shopify";
import { database, dataConnections, sql } from "@ai-cfo/database";
import { logger } from "../../../lib/logger";

const dashboardBase = (): string =>
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const apiBase = (): string =>
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    logger.warn(
      { error, description: url.searchParams.get("error_description") },
      "google oauth callback: user-side error"
    );
    return Response.redirect(
      `${dashboardBase()}/settings/connections?source=google&status=error`,
      302
    );
  }
  if (!(code && state)) {
    return new Response("missing code/state", { status: 400 });
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const stateSecret =
    process.env.GOOGLE_OAUTH_STATE_SECRET ??
    process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;

  if (!(clientId && clientSecret && stateSecret && encryptionKey)) {
    logger.error(
      "google oauth callback: missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / DATA_CONNECTION_ENCRYPTION_KEY"
    );
    return new Response("server misconfigured", { status: 503 });
  }
  if (!developerToken) {
    logger.warn(
      "google oauth callback: GOOGLE_ADS_DEVELOPER_TOKEN missing — connection saved but backfill will fail until set"
    );
  }

  const config: GoogleAdsOAuthConfig = {
    clientId,
    clientSecret,
    redirectUri: `${apiBase()}/oauth/google/callback`,
    stateSecret,
  };

  let result: Awaited<ReturnType<typeof exchangeGoogleAdsCode>>;
  try {
    result = await exchangeGoogleAdsCode({ code, state, config });
  } catch (e) {
    logger.warn({ err: e }, "google oauth callback: state/exchange failed");
    return new Response("state verification or token exchange failed", {
      status: 400,
    });
  }

  // Encrypt the *refresh_token* — the long-lived credential. access_token
  // expires in ~1h and we mint fresh on demand.
  const encryptedRefreshToken = await encryptCredential(
    result.refreshToken,
    encryptionKey
  );

  await database
    .insert(dataConnections)
    .values({
      orgId: result.orgId,
      source: "google",
      status: "active",
      scopes: result.scopes,
      encryptedCredentials: encryptedRefreshToken,
      sourceMetadata: {
        // Customer enumeration via google-ads-api lands when the
        // backfill job runs — it has the SDK as a runtime dep. Day-5
        // stores an empty list so the dashboard can show a "pending
        // discovery" badge.
        customer_ids: [],
        login_customer_id: null,
      },
    })
    .onConflictDoUpdate({
      target: [dataConnections.orgId, dataConnections.source],
      set: {
        status: "active",
        scopes: result.scopes,
        encryptedCredentials: encryptedRefreshToken,
        updatedAt: new Date(),
      },
    });

  const conn = await database.execute<{ id: string }>(
    sql`select id::text as id from public.data_connections
        where org_id = ${result.orgId}::uuid and source = 'google' limit 1`
  );
  const connectionId = (conn as unknown as { id: string }[])[0]?.id;

  if (connectionId) {
    try {
      const { tasks } = await import("@trigger.dev/sdk");
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await tasks.trigger("ai-cfo.google-backfill", {
        orgId: result.orgId,
        connectionId,
        since,
      });
    } catch (e) {
      logger.warn(
        { err: e, orgId: result.orgId },
        "google backfill enqueue failed"
      );
    }
  }

  return Response.redirect(
    `${dashboardBase()}/settings/connections?source=google&status=connected`,
    302
  );
};
