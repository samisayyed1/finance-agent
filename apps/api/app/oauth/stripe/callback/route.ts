import { encryptCredential } from "@ai-cfo/connector-shopify";
import { database, dataConnections, sql } from "@ai-cfo/database";
import { verifyOAuthState } from "@ai-cfo/shared";
import { z } from "zod";
import { logger } from "../../../lib/logger";

/**
 * GET /oauth/stripe/callback
 *
 * Stripe Connect Standard redirect: `?code=…&state=…&scope=…`. We verify the
 * state we minted at install start, exchange the code at
 * https://connect.stripe.com/oauth/token, encrypt the access_token, and
 * upsert the data_connections row. The connected account id
 * (stripe_user_id) lives in source_metadata for webhook routing.
 *
 * The encryption envelope reuses `encryptCredential` from the Shopify
 * connector — it's source-agnostic AES-256-GCM, just lives there for now.
 * TODO: factor encryption into @ai-cfo/shared in a Day-3 cleanup.
 */

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  stripe_user_id: z.string().min(1),
  livemode: z.boolean().optional(),
});

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    logger.warn(
      { error, description: url.searchParams.get("error_description") },
      "stripe oauth callback: user-side error"
    );
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/settings/connections?source=stripe&status=error`,
      302
    );
  }
  if (!(code && state)) {
    return new Response("missing code/state", { status: 400 });
  }

  const clientSecret = process.env.STRIPE_SECRET_KEY;
  const clientId = process.env.STRIPE_CLIENT_ID;
  const encryptionKey = process.env.DATA_CONNECTION_ENCRYPTION_KEY;
  if (!(clientSecret && clientId && encryptionKey)) {
    logger.error(
      "stripe oauth callback: missing STRIPE_SECRET_KEY / STRIPE_CLIENT_ID / DATA_CONNECTION_ENCRYPTION_KEY"
    );
    return new Response("server misconfigured", { status: 503 });
  }

  // CSRF defense: state must verify against our shared HMAC scheme, sourced
  // by clientSecret (any per-source secret would do; we reuse clientSecret).
  const verified = await verifyOAuthState({
    state,
    secret: clientSecret,
    expectedSource: "stripe",
  });
  if (!verified) {
    logger.warn("stripe oauth callback: state verification failed");
    return new Response("state verification failed", { status: 400 });
  }

  // Exchange code at Stripe Connect token endpoint.
  let parsed: z.infer<typeof tokenResponseSchema>;
  try {
    const res = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`stripe token exchange failed: ${res.status} ${text}`);
    }
    parsed = tokenResponseSchema.parse(await res.json());
  } catch (e) {
    logger.error({ err: e }, "stripe oauth callback: token exchange failed");
    return new Response("token exchange failed", { status: 502 });
  }

  const encryptedAccessToken = await encryptCredential(
    parsed.access_token,
    encryptionKey
  );
  const scopes = parsed.scope
    ? parsed.scope.split(",").map((s) => s.trim())
    : [];

  await database
    .insert(dataConnections)
    .values({
      orgId: verified.orgId,
      source: "stripe",
      status: "active",
      scopes,
      encryptedCredentials: encryptedAccessToken,
      sourceMetadata: {
        stripe_account_id: parsed.stripe_user_id,
        livemode: parsed.livemode ?? false,
      },
    })
    .onConflictDoUpdate({
      target: [dataConnections.orgId, dataConnections.source],
      set: {
        status: "active",
        scopes,
        encryptedCredentials: encryptedAccessToken,
        sourceMetadata: {
          stripe_account_id: parsed.stripe_user_id,
          livemode: parsed.livemode ?? false,
        },
        updatedAt: new Date(),
      },
    });

  const conn = await database.execute<{ id: string }>(
    sql`select id::text as id from public.data_connections
        where org_id = ${verified.orgId}::uuid and source = 'stripe' limit 1`
  );
  const connectionId = (conn as unknown as { id: string }[])[0]?.id;

  if (connectionId) {
    try {
      const { tasks } = await import("@trigger.dev/sdk");
      await tasks.trigger("ai-cfo.stripe-backfill", {
        orgId: verified.orgId,
        connectionId,
      });
    } catch (e) {
      logger.warn(
        { err: e, orgId: verified.orgId },
        "stripe backfill enqueue failed"
      );
    }
  }

  const dashboardBase =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.redirect(
    `${dashboardBase}/settings/connections?source=stripe&status=connected`,
    302
  );
};
