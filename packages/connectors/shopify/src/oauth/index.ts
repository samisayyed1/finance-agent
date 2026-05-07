import { z } from "zod";
import { encryptCredential } from "./encryption";
import { buildState, verifyState } from "./state";

export const SHOPIFY_OAUTH_SCOPES = [
  "read_orders",
  "read_products",
  "read_customers",
  "read_payouts",
  "read_fulfillments",
  "read_inventory",
] as const;

export interface OAuthConfig {
  apiKey: string;
  apiSecret: string;
  encryptionKey: string;
  redirectUri: string;
}

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/i;

export const validateShopDomain = (shop: string): string => {
  if (!SHOP_DOMAIN_RE.test(shop)) {
    throw new Error(`invalid shop domain: ${shop}`);
  }
  return shop.toLowerCase();
};

export const authorizeUrl = async (args: {
  orgId: string;
  shop: string;
  config: OAuthConfig;
}): Promise<string> => {
  const { orgId, config } = args;
  const shop = validateShopDomain(args.shop);
  const state = await buildState({
    orgId,
    shop,
    secret: config.apiSecret,
  });
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: SHOPIFY_OAUTH_SCOPES.join(","),
    redirect_uri: config.redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
};

const accessTokenSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string().optional(),
});

export interface OAuthExchangeResult {
  encryptedAccessToken: string;
  orgId: string;
  scopes: string[];
  shop: string;
}

export const exchangeCode = async (args: {
  code: string;
  shop: string;
  state: string;
  config: OAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<OAuthExchangeResult> => {
  const { code, config, fetchImpl = fetch } = args;
  const verified = await verifyState({
    state: args.state,
    secret: config.apiSecret,
  });
  if (!verified) {
    throw new Error("oauth state verification failed");
  }
  const shop = validateShopDomain(verified.shop);
  if (shop !== validateShopDomain(args.shop)) {
    throw new Error("oauth shop mismatch");
  }
  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `shopify token exchange failed: ${res.status} ${res.statusText}`
    );
  }
  const parsed = accessTokenSchema.parse(await res.json());
  const encryptedAccessToken = await encryptCredential(
    parsed.access_token,
    config.encryptionKey
  );
  return {
    orgId: verified.orgId,
    shop,
    scopes: parsed.scope ? parsed.scope.split(",").map((s) => s.trim()) : [],
    encryptedAccessToken,
  };
};
