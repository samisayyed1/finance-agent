import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStripeEvent } from "../src/parse";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "..", "fixtures", `${name}.json`),
      "utf-8"
    )
  );

describe("parseStripeEvent: charge.succeeded", () => {
  const events = parseStripeEvent({
    orgId: ORG_ID,
    rawEvent: fixture("charge-succeeded"),
  });
  it("emits one Payment with cent-exact gross/fee/net", () => {
    expect(events).toHaveLength(1);
    const e = events[0];
    if (e?.kind !== "payment") {
      throw new Error("expected payment");
    }
    expect(e.grossAmountMinor).toBe(21_592);
    expect(e.feeAmountMinor).toBe(656);
    expect(e.netAmountMinor).toBe(20_936);
    expect(e.currency).toBe("USD");
    expect(e.status).toBe("succeeded");
  });
  it("lifts shopify_order_id from metadata when present", () => {
    const e = events[0];
    if (e?.kind !== "payment") {
      throw new Error("expected payment");
    }
    expect(e.sourceOrderId).toBe("820982911946154508");
  });
});

describe("parseStripeEvent: charge.refunded", () => {
  const events = parseStripeEvent({
    orgId: ORG_ID,
    rawEvent: fixture("charge-refunded"),
  });
  it("emits a Payment AND one Refund linked to the charge", () => {
    expect(events).toHaveLength(2);
    const refund = events.find((e) => e.kind === "refund");
    const payment = events.find((e) => e.kind === "payment");
    expect(payment?.kind).toBe("payment");
    expect(refund?.kind).toBe("refund");
    if (refund?.kind === "refund") {
      expect(refund.amountMinor).toBe(5425);
      expect(refund.sourcePaymentId).toBe("ch_test_succeeded_1");
      expect(refund.reason).toBe("requested_by_customer");
    }
  });
});

describe("parseStripeEvent: charge.dispute.created", () => {
  it("emits zero canonical events (Day-2: log only)", () => {
    const events = parseStripeEvent({
      orgId: ORG_ID,
      rawEvent: fixture("charge-dispute-created"),
    });
    expect(events).toHaveLength(0);
  });
});

describe("parseStripeEvent: payout.created / payout.paid / payout.failed", () => {
  it("payout.created emits a Payout in pending status", () => {
    const events = parseStripeEvent({
      orgId: ORG_ID,
      rawEvent: fixture("payout-created"),
    });
    const e = events[0];
    if (e?.kind !== "payout") {
      throw new Error("expected payout");
    }
    expect(e.status).toBe("pending");
    expect(e.grossAmountMinor).toBe(209_360);
    expect(e.expectedArrivalAt).not.toBeNull();
  });
  it("payout.paid emits a Payout with arrivedAt set", () => {
    const events = parseStripeEvent({
      orgId: ORG_ID,
      rawEvent: fixture("payout-paid"),
    });
    const e = events[0];
    if (e?.kind !== "payout") {
      throw new Error("expected payout");
    }
    expect(e.status).toBe("paid");
    expect(e.arrivedAt).not.toBeNull();
  });
  it("payout.failed emits a Payout in failed status", () => {
    const events = parseStripeEvent({
      orgId: ORG_ID,
      rawEvent: fixture("payout-failed"),
    });
    const e = events[0];
    if (e?.kind !== "payout") {
      throw new Error("expected payout");
    }
    expect(e.status).toBe("failed");
  });
});

describe("parseStripeEvent: with application_fee_amount", () => {
  it("uses balance_transaction.fee for fee_amount (not application_fee_amount)", () => {
    const events = parseStripeEvent({
      orgId: ORG_ID,
      rawEvent: fixture("charge-succeeded-with-application-fee"),
    });
    const e = events[0];
    if (e?.kind !== "payment") {
      throw new Error("expected payment");
    }
    expect(e.feeAmountMinor).toBe(350);
    expect(e.netAmountMinor).toBe(9650);
  });
});
