import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhook } from "../src/webhook/verify";

const ENDPOINT_SECRET = "whsec_test_secret_value_42";
const API_KEY = "sk_test_dummy_for_verify";
const PAYLOAD = JSON.stringify({
  id: "evt_test",
  object: "event",
  type: "charge.succeeded",
  livemode: false,
  created: 1_746_547_200,
  data: {
    object: {
      id: "ch_test",
      object: "charge",
      amount: 1000,
      amount_refunded: 0,
      currency: "usd",
      status: "succeeded",
      created: 1_746_547_200,
      metadata: {},
      refunds: { data: [] },
    },
  },
});

const stripeSig = (
  body: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string => {
  const signedPayload = `${timestamp}.${body}`;
  const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${sig}`;
};

describe("verifyStripeWebhook", () => {
  it("returns the event when signature is valid", async () => {
    const sig = stripeSig(PAYLOAD, ENDPOINT_SECRET);
    const event = await verifyStripeWebhook({
      rawBody: PAYLOAD,
      signatureHeader: sig,
      endpointSecret: ENDPOINT_SECRET,
      apiKey: API_KEY,
    });
    expect(event.id).toBe("evt_test");
  });

  it("throws on invalid signature", async () => {
    const sig = stripeSig(PAYLOAD, "wrong_secret");
    await expect(
      verifyStripeWebhook({
        rawBody: PAYLOAD,
        signatureHeader: sig,
        endpointSecret: ENDPOINT_SECRET,
        apiKey: API_KEY,
      })
    ).rejects.toThrow();
  });

  it("throws on body mutation post-sign", async () => {
    const sig = stripeSig(PAYLOAD, ENDPOINT_SECRET);
    await expect(
      verifyStripeWebhook({
        rawBody: `${PAYLOAD}x`,
        signatureHeader: sig,
        endpointSecret: ENDPOINT_SECRET,
        apiKey: API_KEY,
      })
    ).rejects.toThrow();
  });

  it("throws on stale timestamp (replay attack > 5 min old)", async () => {
    // Stripe SDK default tolerance is 300s; use 600s ago.
    const stale = Math.floor(Date.now() / 1000) - 600;
    const sig = stripeSig(PAYLOAD, ENDPOINT_SECRET, stale);
    await expect(
      verifyStripeWebhook({
        rawBody: PAYLOAD,
        signatureHeader: sig,
        endpointSecret: ENDPOINT_SECRET,
        apiKey: API_KEY,
      })
    ).rejects.toThrow();
  });

  it("throws on missing v1 signature in header", async () => {
    await expect(
      verifyStripeWebhook({
        rawBody: PAYLOAD,
        signatureHeader: "t=1746547200",
        endpointSecret: ENDPOINT_SECRET,
        apiKey: API_KEY,
      })
    ).rejects.toThrow();
  });
});
