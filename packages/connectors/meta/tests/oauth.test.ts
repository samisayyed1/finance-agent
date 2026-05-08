import { describe, expect, it } from "vitest";
import {
  buildMetaAuthorizeUrl,
  exchangeMetaCode,
  type MetaOAuthConfig,
} from "../src/oauth";

const STATE_SHAPE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const STATE_ERR_RE = /state/;

const config: MetaOAuthConfig = {
  appId: "1234567890",
  appSecret: "secret",
  redirectUri: "https://app.example.com/oauth/meta/callback",
  stateSecret: "state-secret-32-chars-of-entropy-here",
};

describe("Meta OAuth", () => {
  it("authorizeUrl: includes scopes, redirect, state, response_type=code", async () => {
    const url = await buildMetaAuthorizeUrl({
      config,
      orgId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
    });
    expect(url).toContain("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url).toContain(`client_id=${config.appId}`);
    expect(url).toContain(
      "scope=ads_read%2Cbusiness_management%2Cread_insights"
    );
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=");
    const u = new URL(url);
    const state = u.searchParams.get("state");
    expect(state).toBeTruthy();
    // State is "<bodyB64>.<sigB64>".
    expect(state).toMatch(STATE_SHAPE_RE);
  });

  it("exchangeCode: short→long token swap with mocked Meta API", async () => {
    const orgId = "11111111-1111-4111-8111-aaaaaaaaaaaa";
    const url = await buildMetaAuthorizeUrl({ config, orgId });
    const state = new URL(url).searchParams.get("state") ?? "";

    const calls: string[] = [];
    const fetcher: typeof fetch = (input) => {
      const u = String(input);
      calls.push(u);
      if (u.includes("fb_exchange_token")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "LONG_LIVED_TOKEN",
              expires_in: 5_184_000,
              token_type: "bearer",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "SHORT_LIVED_TOKEN",
            expires_in: 3600,
            token_type: "bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    };

    const result = await exchangeMetaCode({
      code: "AQDxFakeCodeFromMeta",
      config,
      state,
      fetcher,
    });

    expect(result.orgId).toBe(orgId);
    expect(result.accessToken).toBe("LONG_LIVED_TOKEN");
    expect(result.expiresIn).toBe(5_184_000);
    expect(result.scopes).toEqual([
      "ads_read",
      "business_management",
      "read_insights",
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/oauth/access_token");
    expect(calls[1]).toContain("fb_exchange_token");
  });

  it("exchangeCode: rejects when state HMAC signature is invalid", async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(new Response("{}", { status: 200 }));
    // Build a valid-shaped state then swap the signature half — that
    // exercises the constant-time-compare branch (vs. malformed-base64).
    const goodUrl = await buildMetaAuthorizeUrl({
      config,
      orgId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
    });
    const good = new URL(goodUrl).searchParams.get("state") ?? "";
    const [body] = good.split(".");
    const tampered = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    await expect(
      exchangeMetaCode({ code: "x", config, state: tampered, fetcher })
    ).rejects.toThrow(STATE_ERR_RE);
  });
});
