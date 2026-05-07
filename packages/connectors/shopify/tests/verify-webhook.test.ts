import { describe, expect, it } from "vitest";
import { verifyShopifyWebhook } from "../src/webhook/verify";

const SECRET = "shpss_test_secret_value_42";
const BODY = '{"hello":"world","amount":"19.99"}';

const computeHmacBase64 = async (
  body: string,
  secret: string
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  );
  let bin = "";
  for (let i = 0; i < sig.byteLength; i++) {
    bin += String.fromCharCode(sig[i] ?? 0);
  }
  return btoa(bin);
};

describe("verifyShopifyWebhook", () => {
  it("returns true when HMAC matches", async () => {
    const hmac = await computeHmacBase64(BODY, SECRET);
    const ok = await verifyShopifyWebhook({
      rawBody: BODY,
      hmacHeader: hmac,
      secret: SECRET,
    });
    expect(ok).toBe(true);
  });

  it("returns false when HMAC is wrong", async () => {
    const ok = await verifyShopifyWebhook({
      rawBody: BODY,
      hmacHeader: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("returns false when secret is wrong", async () => {
    const hmac = await computeHmacBase64(BODY, SECRET);
    const ok = await verifyShopifyWebhook({
      rawBody: BODY,
      hmacHeader: hmac,
      secret: "wrong-secret",
    });
    expect(ok).toBe(false);
  });

  it("returns false when body is mutated post-sign", async () => {
    const hmac = await computeHmacBase64(BODY, SECRET);
    const ok = await verifyShopifyWebhook({
      rawBody: `${BODY}x`,
      hmacHeader: hmac,
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("returns false when hmac header is missing", async () => {
    const ok = await verifyShopifyWebhook({
      rawBody: BODY,
      hmacHeader: null,
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("returns false on malformed (non-base64) hmac header", async () => {
    const ok = await verifyShopifyWebhook({
      rawBody: BODY,
      hmacHeader: "not_base64_!!!",
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("accepts equivalent Uint8Array body", async () => {
    const hmac = await computeHmacBase64(BODY, SECRET);
    const ok = await verifyShopifyWebhook({
      rawBody: new TextEncoder().encode(BODY),
      hmacHeader: hmac,
      secret: SECRET,
    });
    expect(ok).toBe(true);
  });
});
