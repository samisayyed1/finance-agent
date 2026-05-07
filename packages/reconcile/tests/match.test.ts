import { describe, expect, it } from "vitest";
import {
  type MatchOrder,
  type MatchPayment,
  matchOrdersToPayments,
} from "../src/match";

const T = (iso: string): Date => new Date(iso);

const order = (
  id: string,
  amountMinor: number,
  occurredAt: Date,
  currency = "USD"
): MatchOrder => ({ id, amountMinor, currency, occurredAt });

const payment = (
  id: string,
  amountMinor: number,
  occurredAt: Date,
  currency = "USD",
  feeMinor = 0
): MatchPayment => ({ id, amountMinor, feeMinor, currency, occurredAt });

describe("matchOrdersToPayments", () => {
  it("perfect match: 1 order, 1 payment, exact amount + same time", () => {
    const r = matchOrdersToPayments(
      [order("o1", 9999, T("2026-05-07T10:00:00Z"))],
      [payment("p1", 9999, T("2026-05-07T10:00:00Z"))]
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0]?.orderId).toBe("o1");
    expect(r.matched[0]?.paymentId).toBe("p1");
    expect(r.orphanedOrders).toHaveLength(0);
    expect(r.orphanedPayments).toHaveLength(0);
  });

  it("ORDER_MISSING_PAYMENT: 1 order, 0 payments → orphaned order", () => {
    const r = matchOrdersToPayments(
      [order("o1", 9999, T("2026-05-07T10:00:00Z"))],
      []
    );
    expect(r.orphanedOrders).toEqual(["o1"]);
    expect(r.matched).toHaveLength(0);
    expect(r.orphanedPayments).toHaveLength(0);
  });

  it("PAYMENT_WITHOUT_ORDER: 0 orders, 1 payment → orphaned payment", () => {
    const r = matchOrdersToPayments(
      [],
      [payment("p1", 9999, T("2026-05-07T10:00:00Z"))]
    );
    expect(r.orphanedPayments).toEqual(["p1"]);
    expect(r.matched).toHaveLength(0);
    expect(r.orphanedOrders).toHaveLength(0);
  });

  it("amount off by 1¢ → still matches (within default tolerance)", () => {
    const r = matchOrdersToPayments(
      [order("o1", 10_000, T("2026-05-07T10:00:00Z"))],
      [payment("p1", 9999, T("2026-05-07T10:00:00Z"))]
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0]?.deltaAmountMinor).toBe(1);
  });

  it("amount off by 2¢ → does NOT match → both orphaned", () => {
    const r = matchOrdersToPayments(
      [order("o1", 10_000, T("2026-05-07T10:00:00Z"))],
      [payment("p1", 9998, T("2026-05-07T10:00:00Z"))]
    );
    expect(r.matched).toHaveLength(0);
    expect(r.orphanedOrders).toEqual(["o1"]);
    expect(r.orphanedPayments).toEqual(["p1"]);
  });

  it("time off by 25 min → still matches (within 30-min window)", () => {
    const r = matchOrdersToPayments(
      [order("o1", 9999, T("2026-05-07T10:00:00Z"))],
      [payment("p1", 9999, T("2026-05-07T10:25:00Z"))]
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0]?.deltaTimeMs).toBe(25 * 60 * 1000);
  });

  it("time off by 35 min → does NOT match", () => {
    const r = matchOrdersToPayments(
      [order("o1", 9999, T("2026-05-07T10:00:00Z"))],
      [payment("p1", 9999, T("2026-05-07T10:35:00Z"))]
    );
    expect(r.matched).toHaveLength(0);
  });

  it("two orders same amount, two payments same amount → greedy by closest time", () => {
    // Orders at 10:00 and 10:30. Payments at 10:01 and 10:32.
    // Expected: o1↔p1 (Δ1m), o2↔p2 (Δ2m).
    const r = matchOrdersToPayments(
      [
        order("o1", 5000, T("2026-05-07T10:00:00Z")),
        order("o2", 5000, T("2026-05-07T10:30:00Z")),
      ],
      [
        payment("p1", 5000, T("2026-05-07T10:01:00Z")),
        payment("p2", 5000, T("2026-05-07T10:32:00Z")),
      ]
    );
    expect(r.matched).toHaveLength(2);
    const o1 = r.matched.find((m) => m.orderId === "o1");
    const o2 = r.matched.find((m) => m.orderId === "o2");
    expect(o1?.paymentId).toBe("p1");
    expect(o2?.paymentId).toBe("p2");
  });

  it("universal-extensibility: matches against canonical Order + Payment from any source", () => {
    // Iron Rule #10 guard: matcher must work for QuickBooks↔Plaid as easily
    // as Shopify↔Stripe. We don't pass `source` — the matcher doesn't read it.
    const r = matchOrdersToPayments(
      [order("qb-invoice-1", 12_500, T("2026-05-07T10:00:00Z"))],
      [payment("plaid-deposit-1", 12_500, T("2026-05-07T10:05:00Z"))]
    );
    expect(r.matched).toHaveLength(1);
  });
});
