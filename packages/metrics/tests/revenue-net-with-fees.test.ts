import { describe, expect, it } from "vitest";
import {
  computeDailyMetricsFromRows,
  type OrderRow,
  type PaymentRow,
  type RefundRow,
} from "../src/compute-daily-metrics";

const ORG = "00000000-0000-0000-0000-000000000001";
const DAY = new Date("2026-05-07T00:00:00.000Z");

const order = (totalDecimal: string): OrderRow => ({
  source: "shopify",
  currency: "USD",
  total: totalDecimal,
  createdAtSource: DAY,
  cancelledAtSource: null,
});

const stripePayment = (
  feeDecimal: string,
  status = "succeeded"
): PaymentRow => ({
  source: "stripe",
  status,
  currency: "USD",
  feeAmount: feeDecimal,
  processedAt: DAY,
});

const refund = (amountDecimal: string, source = "shopify"): RefundRow => ({
  source,
  currency: "USD",
  amount: amountDecimal,
  processedAt: DAY,
});

describe("Day-2: revenue_net = revenue_gross − refunds − fees (Dinero, cent-exact)", () => {
  it("$1,000 gross, $29 fees, $0 refunds → fees=$29.00, revenue_net=$971.00", () => {
    // 8 orders averaging $125 = $1,000.
    const orders: OrderRow[] = Array.from({ length: 8 }, () => order("125.00"));
    const payments: PaymentRow[] = [
      stripePayment("10.00"),
      stripePayment("9.50"),
      stripePayment("9.50"),
    ];
    const r = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: orders,
      refundsForDate: [],
      paymentsForDate: payments,
    });
    expect(r.revenue_gross).toBe("1000.00");
    expect(r.fees).toBe("29.00");
    expect(r.refunds).toBe("0.00");
    expect(r.revenue_net).toBe("971.00");
  });

  it("$1,000 gross, $29 fees, $100 refund → revenue_net=$871.00", () => {
    const orders: OrderRow[] = Array.from({ length: 8 }, () => order("125.00"));
    const payments: PaymentRow[] = [stripePayment("29.00")];
    const refunds: RefundRow[] = [refund("100.00")];
    const r = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: orders,
      refundsForDate: refunds,
      paymentsForDate: payments,
    });
    expect(r.revenue_gross).toBe("1000.00");
    expect(r.refunds).toBe("100.00");
    expect(r.fees).toBe("29.00");
    expect(r.revenue_net).toBe("871.00");
  });

  it("$0 gross, $29 fees → revenue_net = -$29.00 (Stripe fees on a different day's transaction)", () => {
    const r = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [],
      refundsForDate: [],
      paymentsForDate: [stripePayment("29.00")],
    });
    expect(r.revenue_gross).toBe("0.00");
    expect(r.fees).toBe("29.00");
    expect(r.revenue_net).toBe("-29.00");
  });

  it("Stripe refund of full $100 — fees still counted (Stripe doesn't refund fees by default)", () => {
    const r = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("100.00")],
      refundsForDate: [refund("100.00", "stripe")],
      paymentsForDate: [stripePayment("3.20")],
    });
    expect(r.revenue_gross).toBe("100.00");
    expect(r.refunds).toBe("100.00");
    expect(r.fees).toBe("3.20");
    expect(r.revenue_net).toBe("-3.20"); // gross 100 − refund 100 − fee 3.20
  });

  it("ignores Stripe payments with non-succeeded status", () => {
    const r = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("500.00")],
      refundsForDate: [],
      paymentsForDate: [
        stripePayment("15.00", "succeeded"),
        stripePayment("99.99", "failed"),
        stripePayment("12.34", "pending"),
      ],
    });
    expect(r.fees).toBe("15.00");
    expect(r.revenue_net).toBe("485.00");
  });

  it("contribution_profit = revenue_net − COGS_stub (COGS=0 until QuickBooks lands)", () => {
    const r = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("500.00")],
      refundsForDate: [],
      paymentsForDate: [stripePayment("14.50")],
    });
    expect(r.revenue_net).toBe("485.50");
    expect(r.contribution_profit).toBe("485.50");
    expect(r.pending_source_connection.some((s) => s.includes("COGS"))).toBe(
      true
    );
  });
});
