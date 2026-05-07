import { exchangeCode, validateShopDomain } from "@ai-cfo/connector-shopify";
import { database, dataConnections, sql } from "@ai-cfo/database";
import { verifyOAuthState } from "@ai-cfo/shared";
import { logger } from "../../../lib/logger";

/**
 * GET /oauth/shopify/callback
 *
 * Shopify redirects here with `?code=…&shop=…&state=…&hmac=…&host=…&timestamp=…`.
 * We verify the state we minted at install start, exchange the code for an
 * access token, encrypt it, upsert the data_connections row, and kick off the
 * 90-day backfill via Trigger.dev. End user lands at the dashboard.
 */
export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shopRaw = url.searchParams.get("shop");
  const state = url.searchParams.get("state");
  if (!(code && shopRaw && state)) {
    return new Response("missing code/shop/state", { status: 400 });
  }

  let shop: string;
  try {
    shop = validateShopDomain(shopRaw);
  } catch {
    return new Response("invalid shop", { status: 400 });
  }

  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const apiKey = process.env.SHOPIFY_API_KEY;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  if (!(apiSecret && apiKey && redirectUri && encryptionKey)) {
    logger.error(
      "shopify oauth callback: missing SHOPIFY_API_KEY/SECRET/REDIRECT_URI or DATA_CONNECTION_ENCRYPTION_KEY"
    );
    return new Response("server misconfigured", { status: 503 });
  }

  // Verify our state HMAC. The shared verifier checks signature, expiry, and
  // that the source matches.
  const verified = await verifyOAuthState({
    state,
    secret: apiSecret,
    expectedSource: "shopify",
  });
  if (!verified) {
    logger.warn(
      { shop, state: state.slice(0, 12) },
      "shopify oauth callback: state verification failed"
    );
    return new Response("state verification failed", { status: 400 });
  }
  if (verified.extra && verified.extra !== shop) {
    logger.warn(
      { shop, extra: verified.extra },
      "shopify oauth callback: shop mismatch with state"
    );
    return new Response("shop mismatch", { status: 400 });
  }

  let exchanged: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    exchanged = await exchangeCode({
      code,
      shop,
      // exchangeCode uses its own state schema for back-compat; we pass our
      // state through but the real verification is the shared verifyOAuthState
      // we already did above. exchangeCode currently re-checks the legacy
      // shop|nonce|expires format — it may reject our shared state. Bypass
      // by minting a one-off shopify-shaped state for the exchange call:
      state: await mintLegacyShopifyState(shop, apiSecret),
      config: {
        apiKey,
        apiSecret,
        redirectUri,
        encryptionKey,
      },
    });
  } catch (e) {
    logger.error(
      { err: e, shop },
      "shopify oauth callback: token exchange failed"
    );
    return new Response("token exchange failed", { status: 502 });
  }

  await database
    .insert(dataConnections)
    .values({
      orgId: verified.orgId,
      source: "shopify",
      status: "active",
      scopes: exchanged.scopes,
      encryptedCredentials: exchanged.encryptedAccessToken,
      sourceMetadata: { shop_domain: shop, scope: exchanged.scopes.join(",") },
    })
    .onConflictDoUpdate({
      target: [dataConnections.orgId, dataConnections.source],
      set: {
        status: "active",
        scopes: exchanged.scopes,
        encryptedCredentials: exchanged.encryptedAccessToken,
        sourceMetadata: {
          shop_domain: shop,
          scope: exchanged.scopes.join(","),
        },
        updatedAt: new Date(),
      },
    });

  // Look up the connection_id we just upserted so backfill can attach to it.
  const conn = await database.execute<{ id: string }>(
    sql`select id::text as id from public.data_connections
        where org_id = ${verified.orgId}::uuid and source = 'shopify' limit 1`
  );
  const connectionId = (conn as unknown as { id: string }[])[0]?.id;

  if (connectionId) {
    try {
      const { tasks } = await import("@trigger.dev/sdk");
      await tasks.trigger("ai-cfo.shopify-backfill", {
        orgId: verified.orgId,
        connectionId,
      });
    } catch (e) {
      logger.warn(
        { err: e, orgId: verified.orgId },
        "shopify backfill enqueue failed"
      );
    }
  }

  const dashboardBase =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.redirect(
    `${dashboardBase}/settings/connections?source=shopify&status=connected`,
    302
  );
};

// data_connections.onConflictDoUpdate uses (orgId, source) as the conflict
// target — we need a unique index on (org_id, source). Day-2 migration ensures
// this. See supabase/migrations/<ts>_data_connections_unique_org_source.sql.

/**
 * The Day-1 `exchangeCode` re-verifies state in its legacy `<orgId>|<shop>|<nonce>|<expiresAt>`
 * format; we mint a fresh one of that shape so the existing callsite keeps
 * working without a Day-1 refactor. The CSRF defense is the shared
 * verifyOAuthState we already ran.
 */
const mintLegacyShopifyState = async (
  shop: string,
  secret: string
): Promise<string> => {
  const { buildState } = await import("@ai-cfo/connector-shopify");
  return await buildState({ orgId: "ephemeral", shop, secret });
};
