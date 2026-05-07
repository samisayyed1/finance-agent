import { auth } from "@ai-cfo/auth/server";
import {
  authorizeUrl as shopifyAuthorizeUrl,
  validateShopDomain,
} from "@ai-cfo/connector-shopify";
import { buildOAuthState } from "@ai-cfo/shared";
import { z } from "zod";
import { logger } from "../../../../lib/logger";

/**
 * POST /api/connections/{source}/initiate
 *
 * Mints a CSRF-safe state, returns the source's `authorizeUrl` for the dashboard
 * to redirect to. Caller must be a signed-in operator with an active Clerk
 * organization (we use the `org_id` from the Clerk JWT).
 */

const SUPPORTED = new Set(["shopify", "stripe"] as const);

const shopifyInitiateBody = z.object({
  shop: z.string().min(1),
});

const stripeInitiateBody = z.object({}).passthrough();

interface RouteContext {
  params: Promise<{ source: string }>;
}

export const POST = async (
  req: Request,
  ctx: RouteContext
): Promise<Response> => {
  const { source } = await ctx.params;
  if (!(SUPPORTED as ReadonlySet<string>).has(source)) {
    return Response.json(
      { error: "unsupported_source", source },
      { status: 400 }
    );
  }

  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as unknown;

  if (source === "shopify") {
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const apiKey = process.env.SHOPIFY_API_KEY;
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
    if (!(apiSecret && apiKey && redirectUri && encryptionKey)) {
      logger.error(
        "initiate/shopify: missing SHOPIFY_* / DATA_CONNECTION_ENCRYPTION_KEY env"
      );
      return Response.json({ error: "server_misconfigured" }, { status: 503 });
    }
    const parsed = shopifyInitiateBody.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "missing_shop_domain", issues: parsed.error.format() },
        { status: 400 }
      );
    }
    let shop: string;
    try {
      shop = validateShopDomain(parsed.data.shop);
    } catch {
      return Response.json({ error: "invalid_shop" }, { status: 400 });
    }
    const state = await buildOAuthState({
      orgId,
      source: "shopify",
      extra: shop,
      secret: apiSecret,
    });
    // The Day-1 shopifyAuthorizeUrl re-mints its own (legacy) state; we wrap
    // it but pass through our shared state in a query param the callback
    // reads. Result: callback verifies our shared state; legacy state is
    // unused. (Day-3 cleanup: drop the legacy state path.)
    const baseUrl = await shopifyAuthorizeUrl({
      orgId,
      shop,
      config: { apiKey, apiSecret, redirectUri, encryptionKey },
    });
    const url = new URL(baseUrl);
    url.searchParams.set("state", state);
    return Response.json({ authorizeUrl: url.toString() });
  }

  // source === "stripe"
  stripeInitiateBody.parse(body); // ensure body is an object, no required fields
  const clientSecret = process.env.STRIPE_SECRET_KEY;
  const clientId = process.env.STRIPE_CLIENT_ID;
  const redirectUri =
    process.env.STRIPE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/oauth/stripe/callback`;
  if (!(clientSecret && clientId)) {
    logger.error(
      "initiate/stripe: missing STRIPE_SECRET_KEY / STRIPE_CLIENT_ID"
    );
    return Response.json({ error: "server_misconfigured" }, { status: 503 });
  }
  const state = await buildOAuthState({
    orgId,
    source: "stripe",
    secret: clientSecret,
  });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_only",
    state,
    redirect_uri: redirectUri,
  });
  return Response.json({
    authorizeUrl: `https://connect.stripe.com/oauth/authorize?${params.toString()}`,
  });
};
