/**
 * Google Ads OAuth.
 *
 * Scope: `https://www.googleapis.com/auth/adwords` (the Ads API uses the
 * legacy AdWords scope name). Need `access_type=offline&prompt=consent` to
 * receive a refresh_token — Google omits it on subsequent grants without
 * that combo.
 *
 * Token lifecycle:
 *   - access_token expires in ~1h.
 *   - refresh_token is what we persist (encrypted).
 *   - We mint fresh access_tokens lazily via google-ads-api when running
 *     GAQL queries.
 */

import { buildOAuthState, verifyOAuthState } from "@ai-cfo/shared";

const SCOPE = "https://www.googleapis.com/auth/adwords";
const WHITESPACE_RE = /\s+/;

export interface GoogleAdsOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

export const buildGoogleAdsAuthorizeUrl = async (args: {
  config: GoogleAdsOAuthConfig;
  orgId: string;
}): Promise<string> => {
  const state = await buildOAuthState({
    orgId: args.orgId,
    source: "google",
    secret: args.config.stateSecret,
  });
  const params = new URLSearchParams({
    client_id: args.config.clientId,
    redirect_uri: args.config.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export type GoogleFetcher = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface GoogleAdsTokenExchangeResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scopes: string[];
  tokenType: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

export const exchangeGoogleAdsCode = async (args: {
  code: string;
  config: GoogleAdsOAuthConfig;
  state: string;
  fetcher?: GoogleFetcher;
}): Promise<GoogleAdsTokenExchangeResult & { orgId: string }> => {
  const fetcher =
    args.fetcher ?? (globalThis.fetch.bind(globalThis) as GoogleFetcher);

  const verified = await verifyOAuthState({
    state: args.state,
    secret: args.config.stateSecret,
    expectedSource: "google",
  });
  if (!verified) {
    throw new Error("google ads oauth: invalid or expired state");
  }

  const body = new URLSearchParams({
    code: args.code,
    client_id: args.config.clientId,
    client_secret: args.config.clientSecret,
    redirect_uri: args.config.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(
      `google ads oauth: ${res.status} ${res.statusText} ${txt.slice(0, 500)}`
    );
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.refresh_token) {
    throw new Error(
      "google ads oauth: response missing refresh_token — ensure access_type=offline + prompt=consent"
    );
  }
  return {
    orgId: verified.orgId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    tokenType: json.token_type,
    scopes: (json.scope ?? SCOPE).split(WHITESPACE_RE).filter(Boolean),
  };
};

/**
 * Customer (a.k.a. account) discovery via google-ads-api would normally
 * use Customer.listAccessibleCustomers. Day-5 ships the OAuth surface;
 * the actual customer enumeration lands in the OAuth callback route
 * (apps/api) which has google-ads-api as a runtime dependency.
 */
export { SCOPE as GOOGLE_ADS_SCOPE };
