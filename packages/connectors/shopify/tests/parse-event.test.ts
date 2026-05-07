import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent } from "../src/parse";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "..", "fixtures", `${name}.json`),
      "utf-8"
    )
  );

describe("parseEvent: orders/create", () => {
  const events = parseEvent({
    orgId: ORG_ID,
    rawPayload: fixture("orders-create"),
    topic: "orders/create",
  });
  const order = events[0];

  it("emits exactly one canonical Order", () => {
    expect(events).toHaveLength(1);
    expect(order?.kind).toBe("order");
  });

  it("captures cent-exact totals", () => {
    if (order?.kind !== "order") {
      throw new Error("expected order");
    }
    expect(order.totalMinor).toBe(21_592); // $215.92
    expect(order.subtotalMinor).toBe(19_900);
    expect(order.totalTaxMinor).toBe(1692);
    expect(order.totalShippingMinor).toBe(0);
    expect(order.totalDiscountMinor).toBe(0);
  });

  it("emits one line item with correct money", () => {
    if (order?.kind !== "order") {
      throw new Error("expected order");
    }
    expect(order.lineItems).toHaveLength(1);
    const li = order.lineItems[0];
    if (!li) {
      throw new Error("expected line item");
    }
    expect(li.unitPriceMinor).toBe(19_900);
    expect(li.quantity).toBe(1);
    expect(li.taxAmountMinor).toBe(1692);
    expect(li.sku).toBe("SKU-A1");
  });

  it("preserves source_metadata raw payload", () => {
    if (order?.kind !== "order") {
      throw new Error("expected order");
    }
    expect(order.sourceMetadata).toHaveProperty("raw");
  });
});

describe("parseEvent: orders/paid", () => {
  const events = parseEvent({
    orgId: ORG_ID,
    rawPayload: fixture("orders-paid"),
    topic: "orders/paid",
  });

  it("emits an Order + a Payment linked by sourceOrderId", () => {
    expect(events).toHaveLength(2);
    const order = events.find((e) => e.kind === "order");
    const payment = events.find((e) => e.kind === "payment");
    expect(order?.kind).toBe("order");
    expect(payment?.kind).toBe("payment");
    if (order?.kind === "order" && payment?.kind === "payment") {
      expect(payment.sourceOrderId).toBe(order.sourceOrderId);
      expect(payment.grossAmountMinor).toBe(order.totalMinor);
      expect(payment.netAmountMinor).toBe(order.totalMinor); // fees come from Stripe later
      expect(payment.feeAmountMinor).toBe(0);
      expect(payment.status).toBe("paid");
    }
  });
});

describe("parseEvent: orders/cancelled", () => {
  const events = parseEvent({
    orgId: ORG_ID,
    rawPayload: fixture("orders-cancelled"),
    topic: "orders/cancelled",
  });

  it("emits an Order with cancelledAtSource set", () => {
    const order = events[0];
    if (order?.kind !== "order") {
      throw new Error("expected order");
    }
    expect(order.cancelledAtSource).not.toBeNull();
  });
});

describe("parseEvent: orders/updated", () => {
  const events = parseEvent({
    orgId: ORG_ID,
    rawPayload: fixture("orders-updated"),
    topic: "orders/updated",
  });

  it("emits an Order reflecting the post-update fulfillment status", () => {
    const order = events[0];
    if (order?.kind !== "order") {
      throw new Error("expected order");
    }
    expect(order.fulfillmentStatus).toBe("fulfilled");
  });
});

describe("parseEvent: refunds/create", () => {
  const events = parseEvent({
    orgId: ORG_ID,
    rawPayload: fixture("refunds-create"),
    topic: "refunds/create",
  });

  it("emits one Refund with the cent-exact transaction amount", () => {
    expect(events).toHaveLength(1);
    const refund = events[0];
    if (refund?.kind !== "refund") {
      throw new Error("expected refund");
    }
    expect(refund.amountMinor).toBe(5425); // $54.25
    expect(refund.currency).toBe("USD");
    expect(refund.sourceOrderId).toBe("820982911946154508");
    expect(refund.sourceRefundId).toBe("509562969");
  });
});

describe("parseEvent: app/uninstalled", () => {
  it("emits zero canonical events", () => {
    const events = parseEvent({
      orgId: ORG_ID,
      rawPayload: fixture("app-uninstalled"),
      topic: "app/uninstalled",
    });
    expect(events).toHaveLength(0);
  });
});

describe("parseEvent: schema-drift detection", () => {
  it("throws on a malformed payload (missing total_price)", () => {
    expect(() =>
      parseEvent({
        orgId: ORG_ID,
        rawPayload: { id: 1 }, // missing required fields
        topic: "orders/create",
      })
    ).toThrow();
  });

  it("throws when total_price has > 2 decimals (silent-rounding guard)", () => {
    const bad = { ...(fixture("orders-create") as object) } as Record<
      string,
      unknown
    >;
    bad.total_price = "215.999";
    expect(() =>
      parseEvent({ orgId: ORG_ID, rawPayload: bad, topic: "orders/create" })
    ).toThrow();
  });
});
