/**
 * Day-5: ROAS / blended_mer / CAC / refund_rate / contribution_profit
 * computations against fixture days. Cent-exact via the Dinero pipeline.
 */

import { describe, expect, it } from "vitest";
import {
  type AdMetricRow,
  computeDailyMetricsFromRows,
  type OrderRow,
} from "../src/compute-daily-metrics";

const ORG = "11111111-2222-4333-8444-555555555555";
const DAY = new Date("2026-05-08T00:00:00Z");

const order = (
  email: string | null,
  total: string,
  cancelled = false
): OrderRow => ({
  source: "shopify",
  currency: "USD",
  total,
  createdAtSource: new Date("2026-05-08T12:00:00Z"),
  cancelledAtSource: cancelled ? new Date("2026-05-08T12:30:00Z") : null,
  customerEmail: email,
});

const adRow = (source: string, spend: string): AdMetricRow => ({
  source,
  currency: "USD",
  spend,
  conversions: "0",
  conversionValue: "0",
});

describe("Day-5 ROAS / MER / CAC", () => {
  it("$5000 revenue / $1000 spend / 25 new customers → roas 5.0000, mer 5.0000, cac $40.00", () => {
    const orders: OrderRow[] = [];
    for (let i = 0; i < 25; i++) {
      orders.push(order(`new${i}@example.com`, "200.00"));
    }
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: orders,
      refundsForDate: [],
      adMetricsForDate: [adRow("meta", "1000.00")],
    });
    expect(result.revenue_gross).toBe("5000.00");
    expect(result.ad_spend).toBe("1000.00");
    expect(result.roas).toBe("5.0000");
    expect(result.blended_mer).toBe("5.0000");
    expect(result.new_customers).toBe(25);
    expect(result.cac).toBe("40.00");
  });

  it("$0 revenue / $1000 spend / 0 new customers → roas 0.0000, cac null (divide-by-zero)", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [],
      refundsForDate: [],
      adMetricsForDate: [adRow("meta", "1000.00")],
    });
    expect(result.revenue_gross).toBe("0.00");
    expect(result.ad_spend).toBe("1000.00");
    expect(result.roas).toBe("0.0000");
    expect(result.blended_mer).toBe("0.0000");
    expect(result.new_customers).toBe(0);
    expect(result.cac).toBeNull();
  });

  it("$5000 revenue / $0 spend → roas null with audit string", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("alice@example.com", "5000.00")],
      refundsForDate: [],
      adMetricsForDate: [],
    });
    expect(result.revenue_gross).toBe("5000.00");
    expect(result.ad_spend).toBe("0.00");
    expect(result.roas).toBeNull();
    expect(result.blended_mer).toBeNull();
    expect(result.cac).toBeNull();
    expect(
      result.pending_source_connection.some((s) => s.includes("ad_spend_zero"))
    ).toBe(true);
  });

  it("multi-source: $5000 / ($600 Meta + $400 Google) → ad_spend $1000, roas 5.0000", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("alice@example.com", "5000.00")],
      refundsForDate: [],
      adMetricsForDate: [adRow("meta", "600.00"), adRow("google", "400.00")],
    });
    expect(result.ad_spend).toBe("1000.00");
    expect(result.roas).toBe("5.0000");
  });

  it("refund-heavy day with negative revenue_net does not break ROAS (uses gross)", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("alice@example.com", "1000.00")],
      refundsForDate: [
        {
          source: "shopify",
          currency: "USD",
          amount: "1500.00",
          processedAt: new Date("2026-05-08T13:00:00Z"),
        },
      ],
      adMetricsForDate: [adRow("meta", "200.00")],
    });
    expect(result.revenue_gross).toBe("1000.00");
    expect(result.refunds).toBe("1500.00");
    // revenue_net = 1000 − 1500 − 0 = −500
    expect(result.revenue_net).toBe("-500.00");
    // ROAS uses gross, so it's still positive.
    expect(result.roas).toBe("5.0000");
  });

  it("cents-exact: $1234.56 spend, $7407.36 revenue → roas 6.0000", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("alice@example.com", "7407.36")],
      refundsForDate: [],
      adMetricsForDate: [adRow("meta", "1234.56")],
    });
    expect(result.revenue_gross).toBe("7407.36");
    expect(result.ad_spend).toBe("1234.56");
    expect(result.roas).toBe("6.0000");
  });
});

describe("Day-5 refund_rate", () => {
  it("$200 refunds on $1000 gross → refund_rate 0.200000", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("alice@example.com", "1000.00")],
      refundsForDate: [
        {
          source: "shopify",
          currency: "USD",
          amount: "200.00",
          processedAt: new Date("2026-05-08T13:00:00Z"),
        },
      ],
    });
    expect(result.refund_rate).toBe("0.200000");
  });

  it("$0 gross → refund_rate null", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [],
      refundsForDate: [],
    });
    expect(result.refund_rate).toBeNull();
  });
});
