/**
 * Meta (Facebook Login for Business) OAuth.
 *
 * Scope set: ads_read + business_management + read_insights — the minimum
 * to enumerate the operator's ad accounts and pull daily insights without
 * granting any write capability.
 *
 * Token lifecycle:
 *   - The /oauth/access_token endpoint returns a short-lived user token.
 *   - We immediately exchange it for a long-lived (~60 day) token via the
 *     same endpoint with grant_type=fb_exchange_token. We store the long
 *     token only; refresh happens lazily on 401 (Day-6+).
 */

import { buildOAuthState, verifyOAuthState } from "@ai-cfo/shared";

const META_API_VERSION = "v21.0";
const REQUIRED_SCOPES = [
  "ads_read",
  "business_management",
  "read_insights",
] as const;

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Secret used to sign the OAuth state parameter. Reuse the data-connection
   *  encryption key OR set a dedicated META_OAUTH_STATE_SECRET. */
  stateSecret: string;
}

export const buildMetaAuthorizeUrl = async (args: {
  config: MetaOAuthConfig;
  orgId: string;
}): Promise<string> => {
  const state = await buildOAuthState({
    orgId: args.orgId,
    source: "meta",
    secret: args.config.stateSecret,
  });
  const params = new URLSearchParams({
    client_id: args.config.appId,
    redirect_uri: args.config.redirectUri,
    scope: REQUIRED_SCOPES.join(","),
    state,
    response_type: "code",
  });
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
};

export interface MetaTokenExchangeResult {
  /** Long-lived access token (~60 day expiry). */
  accessToken: string;
  /** Seconds until expiry from the issuing time. */
  expiresIn: number;
  /** Comma-joined granted scopes; populated when Meta returns them. */
  scopes: string[];
  tokenType: "bearer" | string;
}

export type MetaFetcher = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

const fetchJson = async <T>(url: string, fetcher: MetaFetcher): Promise<T> => {
  const res = await fetcher(url, { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`meta oauth: ${res.status} ${res.statusText} ${body}`);
  }
  return (await res.json()) as T;
};

interface ShortLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

interface LongLivedTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
}

export const exchangeMetaCode = async (args: {
  code: string;
  config: MetaOAuthConfig;
  /** Required: the same `state` query param the redirect supplied. */
  state: string;
  /** Injectable for tests. Defaults to the platform `fetch`. */
  fetcher?: MetaFetcher;
}): Promise<MetaTokenExchangeResult & { orgId: string }> => {
  const fetcher =
    args.fetcher ?? (globalThis.fetch.bind(globalThis) as MetaFetcher);

  const verified = await verifyOAuthState({
    state: args.state,
    secret: args.config.stateSecret,
    expectedSource: "meta",
  });
  if (!verified) {
    throw new Error("meta oauth: invalid or expired state");
  }

  const shortParams = new URLSearchParams({
    client_id: args.config.appId,
    client_secret: args.config.appSecret,
    redirect_uri: args.config.redirectUri,
    code: args.code,
  });
  const shortUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${shortParams.toString()}`;
  const short = await fetchJson<ShortLivedTokenResponse>(shortUrl, fetcher);

  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: args.config.appId,
    client_secret: args.config.appSecret,
    fb_exchange_token: short.access_token,
  });
  const longUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${longParams.toString()}`;
  const long = await fetchJson<LongLivedTokenResponse>(longUrl, fetcher);

  return {
    orgId: verified.orgId,
    accessToken: long.access_token,
    expiresIn: long.expires_in,
    tokenType: (long.token_type ?? "bearer") as "bearer" | string,
    scopes: REQUIRED_SCOPES.slice(),
  };
};

interface AdAccountListItem {
  account_id: string;
  account_status: number;
  currency: string;
  id: string;
  name: string;
}

interface AdAccountListResponse {
  data: AdAccountListItem[];
  paging?: { cursors?: { after?: string } };
}

export interface MetaAdAccount {
  /** Bare account id (numeric) — excludes the `act_` prefix. */
  accountId: string;
  accountStatus: number;
  currency: string;
  /** id including the `act_` prefix as Meta uses it. */
  fullId: string;
  name: string;
}

/**
 * Enumerate ad accounts the granted user can access. Used at OAuth callback
 * time to populate `data_connections.source_metadata.ad_account_ids`. If
 * multiple, we default to the first one for Day-5; Day-6+ ships an
 * operator-pick UI on the connections page.
 */
export const listMetaAdAccounts = async (args: {
  accessToken: string;
  fetcher?: MetaFetcher;
}): Promise<MetaAdAccount[]> => {
  const fetcher =
    args.fetcher ?? (globalThis.fetch.bind(globalThis) as MetaFetcher);
  const params = new URLSearchParams({
    access_token: args.accessToken,
    fields: "id,account_id,name,account_status,currency",
    limit: "100",
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?${params.toString()}`;
  const result = await fetchJson<AdAccountListResponse>(url, fetcher);
  return result.data.map((a) => ({
    accountId: a.account_id,
    fullId: a.id,
    name: a.name,
    accountStatus: a.account_status,
    currency: a.currency,
  }));
};

export { META_API_VERSION, REQUIRED_SCOPES };
