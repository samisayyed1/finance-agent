import { describe, expect, it } from "vitest";
import {
  computeShopifyDailyMetricsFromRows,
  type OrderRow,
  type RefundRow,
} from "../src/compute-daily-metrics";

const ORG = "00000000-0000-0000-0000-000000000001";
const DAY = new Date("2026-05-07T00:00:00.000Z");
const YESTERDAY = new Date("2026-05-06T00:00:00.000Z");

const order = (
  totalDecimal: string,
  createdAt: Date,
  cancelled = false
): OrderRow => ({
  source: "shopify",
  currency: "USD",
  total: totalDecimal,
  createdAtSource: createdAt,
  cancelledAtSource: cancelled ? new Date(createdAt.getTime() + 60_000) : null,
});

const refund = (amountDecimal: string, processedAt: Date): RefundRow => ({
  source: "shopify",
  currency: "USD",
  amount: amountDecimal,
  processedAt,
});

describe("computeShopifyDailyMetricsFromRows: 12 orders, 3 refunds", () => {
  // 12 orders summing to $1,234.56 cent-exact:
  //   3 × $99.99   = $299.97
  //   2 × $150.00  = $300.00
  //   4 × $50.05   = $200.20
  //   1 × $234.39  = $234.39   <-- chosen so total ends at $1234.56
  //   2 × $100.00  = $200.00
  // sum = 299.97 + 300.00 + 200.20 + 234.39 + 200.00 = 1234.56
  const orders: OrderRow[] = [
    order("99.99", DAY),
    order("99.99", DAY),
    order("99.99", DAY),
    order("150.00", DAY),
    order("150.00", DAY),
    order("50.05", DAY),
    order("50.05", DAY),
    order("50.05", DAY),
    order("50.05", DAY),
    order("234.39", DAY),
    order("100.00", DAY),
    order("100.00", DAY),
  ];

  // 3 refunds summing to $123.45:
  //   $50.00 + $30.45 + $43.00 = $123.45
  const refunds: RefundRow[] = [
    refund("50.00", DAY),
    refund("30.45", DAY),
    refund("43.00", DAY),
  ];

  const result = computeShopifyDailyMetricsFromRows({
    orgId: ORG,
    date: DAY,
    ordersForDate: orders,
    refundsForDate: refunds,
  });

  it("revenue_gross = $1,234.56 (cent-exact)", () => {
    expect(result.revenue_gross).toBe("1234.56");
  });

  it("refunds = $123.45 (cent-exact)", () => {
    expect(result.refunds).toBe("123.45");
  });

  it("revenue_net = $1,111.11 (cent-exact, gross − refunds)", () => {
    expect(result.revenue_net).toBe("1111.11");
  });

  it("orders = 12", () => {
    expect(result.orders).toBe(12);
  });

  it("aov = revenue_net / orders, rounded half-even (cent-exact)", () => {
    // 1111.11 / 12 = 92.5925 → round to 92.59
    expect(result.aov).toBe("92.59");
  });

  it("snapshot_id encodes orgId and date", () => {
    expect(result.snapshot_id.startsWith(`${ORG}-2026-05-07-`)).toBe(true);
  });

  it("explicitly nulls fields pending other connectors", () => {
    expect(result.fees).toBeNull();
    expect(result.ad_spend).toBeNull();
    expect(result.gross_margin).toBeNull();
    expect(result.contribution_profit).toBeNull();
    expect(result.roas).toBeNull();
    expect(result.blended_mer).toBeNull();
    expect(result.cac).toBeNull();
    expect(result.new_customers).toBeNull();
    expect(result.refund_rate).toBeNull();
  });
});

describe("computeShopifyDailyMetricsFromRows: edge cases", () => {
  it("zero orders day → revenue_gross 0.00, aov null", () => {
    const r = computeShopifyDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [],
      refundsForDate: [],
    });
    expect(r.revenue_gross).toBe("0.00");
    expect(r.revenue_net).toBe("0.00");
    expect(r.refunds).toBe("0.00");
    expect(r.orders).toBe(0);
    expect(r.aov).toBeNull();
  });

  it("all orders cancelled → revenue_gross 0.00, orders 0", () => {
    const r = computeShopifyDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("100.00", DAY, true), order("250.50", DAY, true)],
      refundsForDate: [],
    });
    expect(r.revenue_gross).toBe("0.00");
    expect(r.orders).toBe(0);
    expect(r.aov).toBeNull();
  });

  it("refund processed today against an order created yesterday → refunds today, revenue_gross today unchanged", () => {
    const r = computeShopifyDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        // Today's orders are smaller than the refund — the test asserts the
        // accounting choice that revenue_net can go negative when refunds of
        // prior-day orders exceed today's gross.
        order("80.00", DAY),
      ],
      // The refund is for a $99.00 order placed yesterday.
      refundsForDate: [refund("99.00", DAY)],
    });
    expect(r.revenue_gross).toBe("80.00");
    expect(r.refunds).toBe("99.00");
    expect(r.revenue_net).toBe("-19.00");
    expect(r.orders).toBe(1);
  });

  it("ignores non-shopify orders/refunds (universal-extensibility guard)", () => {
    const r = computeShopifyDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        order("100.00", DAY),
        // A stripe-sourced order — should be ignored when the metric is
        // shopify-only. Day-2 onwards we'll union sources properly.
        { ...order("999.99", DAY), source: "stripe" },
      ],
      refundsForDate: [],
    });
    expect(r.revenue_gross).toBe("100.00");
    expect(r.orders).toBe(1);
  });

  it("the pure function trusts the caller — does not re-filter by date", () => {
    // The DB query upstream is the one that filters by `created_at_source::date = date`.
    // The pure function sums whatever rows it's given. This test pins that
    // invariant so a future refactor doesn't accidentally double-filter.
    const r = computeShopifyDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [order("999.00", YESTERDAY), order("12.00", DAY)],
      refundsForDate: [],
    });
    expect(r.revenue_gross).toBe("1011.00");
    expect(r.orders).toBe(2);
  });
});
