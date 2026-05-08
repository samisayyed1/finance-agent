import { describe, expect, it } from "vitest";
import { makeRng } from "../rng";
import { maeveScenario } from "../scenario-maeve";
import { type SynthesisWindow, synthesizeOrders } from "../synthesize-orders";
import { synthesizeStripeForOrders } from "../synthesize-stripe";

const FIXED_END = new Date(Date.UTC(2026, 4, 7));
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const window: SynthesisWindow = {
  start: new Date(FIXED_END.getTime() - 89 * ONE_DAY_MS),
  end: FIXED_END,
};

const buildAll = (seed: string) => {
  const rng = makeRng(seed);
  const orders = synthesizeOrders(maeveScenario, rng, window);
  const stripe = synthesizeStripeForOrders(
    orders,
    maeveScenario,
    rng,
    FIXED_END
  );
  return { orders, ...stripe };
};

describe("synthesizeStripeForOrders — coverage", () => {
  it("every paid non-cancelled order has a matching payment EXCEPT the 8 deliberate gaps", () => {
    const { orders, payments } = buildAll("stripe-cov-seed");
    const expected = orders.filter(
      (o) => o.financialStatus === "paid" && o.cancelledAtSource === null
    ).length;
    expect(payments.length).toBe(expected - 8);
  });
});

describe("synthesizeStripeForOrders — payout gap", () => {
  it("at least one payout has expected_arrival ≥ 5 calendar days after period_end (gap of 3 business days)", () => {
    const { payouts } = buildAll("stripe-gap-seed");
    const delays = payouts.map((p) => {
      const calendarDays =
        (p.expectedArrivalAt.getTime() - p.periodEnd.getTime()) / ONE_DAY_MS;
      return calendarDays;
    });
    expect(delays.some((d) => d >= 5)).toBe(true);
  });
});

describe("synthesizeStripeForOrders — payout cadence", () => {
  it("yields 12-13 weekly payouts across a 90-day window", () => {
    const { payouts } = buildAll("stripe-cadence-seed");
    expect(payouts.length).toBeGreaterThanOrEqual(11);
    expect(payouts.length).toBeLessThanOrEqual(14);
  });
});

describe("synthesizeStripeForOrders — refund timing", () => {
  it("each refund processed_at sits between order created_at and now", () => {
    const { orders, refunds } = buildAll("stripe-refund-seed");
    const now = FIXED_END.getTime() + ONE_DAY_MS;
    const orderById = new Map(orders.map((o) => [o.sourceOrderId, o]));
    for (const r of refunds) {
      const order = orderById.get(r.sourceOrderRef);
      if (!order) {
        throw new Error(`refund references unknown order: ${r.sourceOrderRef}`);
      }
      expect(r.processedAt.getTime()).toBeGreaterThan(
        order.createdAtSource.getTime()
      );
      expect(r.processedAt.getTime()).toBeLessThan(now);
    }
  });
});
