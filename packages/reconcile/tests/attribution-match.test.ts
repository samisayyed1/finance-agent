import { describe, expect, it } from "vitest";
import {
  detectAttributionMismatch,
  type OrderForAttribution,
} from "../src/attribution-match";

const ORG = "11111111-2222-4333-8444-555555555555";
const DAY = new Date("2026-05-08T00:00:00Z");

const orders = (
  n: number,
  source: OrderForAttribution["inferredMarketingSource"]
): OrderForAttribution[] =>
  Array.from({ length: n }, () => ({ inferredMarketingSource: source }));

describe("detectAttributionMismatch", () => {
  it("Meta says 25, Shopify utm_source=fb has 25 → no flag", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 25 }],
      orders: orders(25, "meta"),
    });
    expect(out).toHaveLength(0);
  });

  it("Meta says 25, Shopify has 18 → flag, severity='low' (drift 28%)", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 25 }],
      orders: orders(18, "meta"),
    });
    expect(out).toHaveLength(1);
    expect(out[0].adSource).toBe("meta");
    expect(out[0].driftPct).toBeCloseTo(0.28, 2);
    expect(out[0].driftAbs).toBe(7);
    expect(out[0].severity).toBe("low");
    expect(out[0].reportedConversions).toBe(25);
    expect(out[0].observedOrders).toBe(18);
  });

  it("Meta says 25, Shopify has 27 → no flag (drift 7%, under 25%)", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 25 }],
      orders: orders(27, "meta"),
    });
    expect(out).toHaveLength(0);
  });

  it("Meta says 8, Shopify has 5 → flag (drift 37.5%, delta 3, severity='medium')", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 8 }],
      orders: orders(5, "meta"),
    });
    expect(out).toHaveLength(1);
    expect(out[0].driftPct).toBeCloseTo(0.375, 3);
    expect(out[0].driftAbs).toBe(3);
    expect(out[0].severity).toBe("medium");
  });

  it("Meta says 6, Shopify has 4 → no flag (delta 2, below 3 floor)", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 6 }],
      orders: orders(4, "meta"),
    });
    expect(out).toHaveLength(0);
  });

  it("both = 0 → no flag (avoid div-by-zero)", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [],
      orders: [],
    });
    expect(out).toHaveLength(0);
  });

  it("Meta says 50, Shopify has 20 → flag with severity='high' (drift 60%)", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 50 }],
      orders: orders(20, "meta"),
    });
    expect(out).toHaveLength(1);
    expect(out[0].driftPct).toBeCloseTo(0.6, 2);
    expect(out[0].severity).toBe("high");
  });

  it("custom thresholds: minDriftPct=0.10 catches smaller drift", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [{ source: "meta", conversions: 25 }],
      orders: orders(20, "meta"),
      thresholds: { minDriftPct: 0.1, minDelta: 3 },
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("low");
  });

  it("Google + Meta independently: only the one over threshold flags", () => {
    const out = detectAttributionMismatch({
      orgId: ORG,
      date: DAY,
      adMetrics: [
        { source: "meta", conversions: 50 },
        { source: "google", conversions: 10 },
      ],
      orders: [...orders(20, "meta"), ...orders(11, "google")],
    });
    expect(out).toHaveLength(1);
    expect(out[0].adSource).toBe("meta");
  });
});
