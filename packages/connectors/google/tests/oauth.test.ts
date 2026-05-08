import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsAuthorizeUrl,
  exchangeGoogleAdsCode,
  type GoogleAdsOAuthConfig,
} from "../src/oauth";

const REFRESH_TOKEN_RE = /refresh_token/;

const config: GoogleAdsOAuthConfig = {
  clientId: "1234.apps.googleusercontent.com",
  clientSecret: "GOCSPX-secret",
  redirectUri: "https://app.example.com/oauth/google/callback",
  stateSecret: "state-secret-32-chars-of-entropy-here",
};

describe("Google Ads OAuth", () => {
  it("authorizeUrl: includes adwords scope, offline access, prompt=consent", async () => {
    const url = await buildGoogleAdsAuthorizeUrl({
      config,
      orgId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
    });
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain(
      "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords"
    );
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("state=");
  });

  it("exchangeCode: trades auth code for refresh+access token via mocked endpoint", async () => {
    const orgId = "11111111-1111-4111-8111-aaaaaaaaaaaa";
    const url = await buildGoogleAdsAuthorizeUrl({ config, orgId });
    const state = new URL(url).searchParams.get("state") ?? "";

    const fetcher: typeof fetch = (input, init) => {
      expect(String(input)).toBe("https://oauth2.googleapis.com/token");
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(body).toContain("grant_type=authorization_code");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "ACCESS",
            refresh_token: "REFRESH",
            expires_in: 3599,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/adwords",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    };

    const result = await exchangeGoogleAdsCode({
      code: "auth-code",
      config,
      state,
      fetcher,
    });
    expect(result.orgId).toBe(orgId);
    expect(result.accessToken).toBe("ACCESS");
    expect(result.refreshToken).toBe("REFRESH");
    expect(result.expiresIn).toBe(3599);
    expect(result.scopes).toContain("https://www.googleapis.com/auth/adwords");
  });

  it("exchangeCode: throws when refresh_token missing", async () => {
    const orgId = "11111111-1111-4111-8111-aaaaaaaaaaaa";
    const url = await buildGoogleAdsAuthorizeUrl({ config, orgId });
    const state = new URL(url).searchParams.get("state") ?? "";
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "x",
            expires_in: 3599,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    await expect(
      exchangeGoogleAdsCode({ code: "x", config, state, fetcher })
    ).rejects.toThrow(REFRESH_TOKEN_RE);
  });
});
