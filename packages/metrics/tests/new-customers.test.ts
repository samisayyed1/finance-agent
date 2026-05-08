/**
 * Day-5: new_customers detection (first-time buyer per customer_email,
 * dedupe on email, exclude cancelled/null-email orders).
 */

import { describe, expect, it } from "vitest";
import {
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

describe("new_customers detection", () => {
  it("5 distinct first-time emails + 3 returning → 5 new", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        order("alice@example.com", "100.00"),
        order("bob@example.com", "100.00"),
        order("carol@example.com", "100.00"),
        order("dave@example.com", "100.00"),
        order("eve@example.com", "100.00"),
        order("returning1@example.com", "50.00"),
        order("returning2@example.com", "50.00"),
        order("returning3@example.com", "50.00"),
      ],
      refundsForDate: [],
      priorCustomerEmails: new Set([
        "returning1@example.com",
        "returning2@example.com",
        "returning3@example.com",
      ]),
    });
    expect(result.new_customers).toBe(5);
    expect(result.orders).toBe(8);
  });

  it("0 new (all returning) → 0", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        order("returning1@example.com", "100.00"),
        order("returning2@example.com", "100.00"),
      ],
      refundsForDate: [],
      priorCustomerEmails: new Set([
        "returning1@example.com",
        "returning2@example.com",
      ]),
    });
    expect(result.new_customers).toBe(0);
  });

  it("same email twice on the same day → 1 new (dedupe)", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        order("alice@example.com", "100.00"),
        order("alice@example.com", "75.00"),
      ],
      refundsForDate: [],
      priorCustomerEmails: new Set(),
    });
    expect(result.new_customers).toBe(1);
    expect(result.orders).toBe(2);
  });

  it("NULL customer_email orders are excluded from new-customer count", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        order(null, "100.00"),
        order(null, "100.00"),
        order("alice@example.com", "100.00"),
      ],
      refundsForDate: [],
      priorCustomerEmails: new Set(),
    });
    expect(result.new_customers).toBe(1);
    expect(result.orders).toBe(3);
  });

  it("cancelled orders excluded from new-customer count", () => {
    const result = computeDailyMetricsFromRows({
      orgId: ORG,
      date: DAY,
      ordersForDate: [
        order("alice@example.com", "100.00", true),
        order("bob@example.com", "100.00"),
      ],
      refundsForDate: [],
      priorCustomerEmails: new Set(),
    });
    expect(result.new_customers).toBe(1);
    expect(result.orders).toBe(1);
  });
});
