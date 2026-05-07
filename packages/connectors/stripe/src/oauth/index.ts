import { buildOAuthState, verifyOAuthState } from "@ai-cfo/shared";
import { z } from "zod";

/**
 * Stripe Connect Standard OAuth flow.
 *
 * authorizeUrl(orgId) → redirect URL.
 * exchangeCode({ code, state, config }) → connected-account credentials,
 *   ready for AES-256-GCM envelope into data_connections.encrypted_credentials.
 */

export interface StripeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  stripe_user_id: z.string().min(1),
  livemode: z.boolean().optional(),
});

export const authorizeUrl = async (args: {
  orgId: string;
  config: StripeOAuthConfig;
}): Promise<string> => {
  const state = await buildOAuthState({
    orgId: args.orgId,
    source: "stripe",
    secret: args.config.clientSecret,
  });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.config.clientId,
    scope: "read_only",
    state,
    redirect_uri: args.config.redirectUri,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
};

export interface StripeOAuthExchangeResult {
  accessToken: string;
  livemode: boolean;
  orgId: string;
  scopes: string[];
  stripeAccountId: string;
}

export const exchangeCode = async (args: {
  code: string;
  state: string;
  config: StripeOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<StripeOAuthExchangeResult> => {
  const verified = await verifyOAuthState({
    state: args.state,
    secret: args.config.clientSecret,
    expectedSource: "stripe",
  });
  if (!verified) {
    throw new Error("stripe oauth state verification failed");
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const res = await fetchImpl("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_secret: args.config.clientSecret,
      code: args.code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`stripe token exchange failed: ${res.status} ${text}`);
  }
  const parsed = tokenResponseSchema.parse(await res.json());
  return {
    orgId: verified.orgId,
    accessToken: parsed.access_token,
    stripeAccountId: parsed.stripe_user_id,
    livemode: parsed.livemode ?? false,
    scopes: parsed.scope ? parsed.scope.split(",").map((s) => s.trim()) : [],
  };
};
