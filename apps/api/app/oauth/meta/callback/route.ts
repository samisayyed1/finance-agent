/**
 * GET /oauth/meta/callback
 *
 * Meta (Facebook Login for Business) redirect: `?code=…&state=…`. We verify
 * the HMAC-signed state, exchange short-lived → long-lived token, list ad
 * accounts, encrypt the long-lived token, upsert the data_connections row,
 * and enqueue the meta-backfill Trigger.dev task.
 *
 * If META_APP_ID / META_APP_SECRET are unset (Day-5 ships before Sami's
 * Meta app exists), we surface 503 so the dashboard can show a
 * "credentials missing" state instead of crashing.
 */

import {
  exchangeMetaCode,
  listMetaAdAccounts,
  type MetaOAuthConfig,
} from "@ai-cfo/connector-meta";
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
      "meta oauth callback: user-side error"
    );
    return Response.redirect(
      `${dashboardBase()}/settings/connections?source=meta&status=error`,
      302
    );
  }
  if (!(code && state)) {
    return new Response("missing code/state", { status: 400 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const stateSecret =
    process.env.META_OAUTH_STATE_SECRET ??
    process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;

  if (!(appId && appSecret && stateSecret && encryptionKey)) {
    logger.error(
      "meta oauth callback: missing META_APP_ID / META_APP_SECRET / DATA_CONNECTION_ENCRYPTION_KEY"
    );
    return new Response("server misconfigured", { status: 503 });
  }

  const config: MetaOAuthConfig = {
    appId,
    appSecret,
    redirectUri: `${apiBase()}/oauth/meta/callback`,
    stateSecret,
  };

  let result: Awaited<ReturnType<typeof exchangeMetaCode>>;
  try {
    result = await exchangeMetaCode({ code, state, config });
  } catch (e) {
    logger.warn({ err: e }, "meta oauth callback: state/exchange failed");
    return new Response("state verification or token exchange failed", {
      status: 400,
    });
  }

  let adAccounts: Awaited<ReturnType<typeof listMetaAdAccounts>> = [];
  try {
    adAccounts = await listMetaAdAccounts({ accessToken: result.accessToken });
  } catch (e) {
    logger.warn(
      { err: e, orgId: result.orgId },
      "meta oauth callback: ad account enumeration failed (continuing)"
    );
  }

  const encryptedAccessToken = await encryptCredential(
    result.accessToken,
    encryptionKey
  );

  await database
    .insert(dataConnections)
    .values({
      orgId: result.orgId,
      source: "meta",
      status: "active",
      scopes: result.scopes,
      encryptedCredentials: encryptedAccessToken,
      sourceMetadata: {
        ad_account_ids: adAccounts.map((a) => a.fullId),
        primary_ad_account_id: adAccounts[0]?.fullId ?? null,
        currency: adAccounts[0]?.currency ?? null,
        token_expires_at: new Date(
          Date.now() + result.expiresIn * 1000
        ).toISOString(),
      },
    })
    .onConflictDoUpdate({
      target: [dataConnections.orgId, dataConnections.source],
      set: {
        status: "active",
        scopes: result.scopes,
        encryptedCredentials: encryptedAccessToken,
        sourceMetadata: {
          ad_account_ids: adAccounts.map((a) => a.fullId),
          primary_ad_account_id: adAccounts[0]?.fullId ?? null,
          currency: adAccounts[0]?.currency ?? null,
          token_expires_at: new Date(
            Date.now() + result.expiresIn * 1000
          ).toISOString(),
        },
        updatedAt: new Date(),
      },
    });

  const conn = await database.execute<{ id: string }>(
    sql`select id::text as id from public.data_connections
        where org_id = ${result.orgId}::uuid and source = 'meta' limit 1`
  );
  const connectionId = (conn as unknown as { id: string }[])[0]?.id;

  if (connectionId) {
    try {
      const { tasks } = await import("@trigger.dev/sdk");
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await tasks.trigger("ai-cfo.meta-backfill", {
        orgId: result.orgId,
        connectionId,
        since,
      });
    } catch (e) {
      logger.warn(
        { err: e, orgId: result.orgId },
        "meta backfill enqueue failed"
      );
    }
  }

  return Response.redirect(
    `${dashboardBase()}/settings/connections?source=meta&status=connected`,
    302
  );
};
