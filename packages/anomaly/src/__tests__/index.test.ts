import { describe, expect, it } from "vitest";
import {
  computeAnomalyCandidates,
  dowAwareDelta,
  rollingZScore,
  type SeriesPoint,
  severity,
} from "..";

describe("rollingZScore", () => {
  it("returns 0 when history is too short", () => {
    expect(rollingZScore([42])).toBe(0);
    expect(rollingZScore([])).toBe(0);
  });
  it("returns 0 when std is 0 (constant history)", () => {
    expect(rollingZScore([10, 10, 10, 10, 10, 10, 10, 10])).toBe(0);
  });
  it("emits a high z when the last point is far above history", () => {
    const z = rollingZScore([10, 11, 9, 10, 11, 9, 10, 100]);
    expect(z).toBeGreaterThan(3);
  });
  it("emits a negative z when the last point dives below history", () => {
    const z = rollingZScore([100, 110, 90, 100, 105, 95, 100, 0]);
    expect(z).toBeLessThan(-3);
  });
  it("respects the window size", () => {
    const wide = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      100,
    ];
    const z14 = rollingZScore(wide, 14);
    const z3 = rollingZScore(wide, 3);
    // Smaller window has tighter recent baseline → much larger z.
    expect(Math.abs(z3)).toBeGreaterThan(Math.abs(z14));
  });
});

describe("dowAwareDelta", () => {
  const mk = (iso: string, value: number): SeriesPoint => ({
    date: new Date(iso),
    value,
  });
  const series: SeriesPoint[] = [
    mk("2026-04-13", 100), // Mon
    mk("2026-04-20", 110), // Mon
    mk("2026-04-27", 105), // Mon
    mk("2026-05-04", 90), // Mon
    mk("2026-05-11", 80), // Mon — target
  ];
  it("returns 0 when there is no comparable history", () => {
    expect(dowAwareDelta([], new Date("2026-05-11"))).toBe(0);
  });
  it("returns 0 when the target date is not in the series", () => {
    expect(dowAwareDelta(series, new Date("2026-05-12"))).toBe(0);
  });
  it("computes the % delta against the four most recent same-DOW values", () => {
    const baseline = (100 + 110 + 105 + 90) / 4; // 101.25
    const expected = 80 / baseline - 1;
    expect(dowAwareDelta(series, new Date("2026-05-11"))).toBeCloseTo(
      expected,
      4
    );
  });
});

describe("severity", () => {
  it("|z| < 2 = low", () => {
    expect(severity(0)).toBe("low");
    expect(severity(1.5)).toBe("low");
  });
  it("2 <= |z| < 3 = medium", () => {
    expect(severity(2.0)).toBe("medium");
    expect(severity(-2.5)).toBe("medium");
  });
  it("|z| >= 3 = high", () => {
    expect(severity(3.0)).toBe("high");
    expect(severity(-4.2)).toBe("high");
  });
  it("respects per-org overrides", () => {
    expect(severity(2.5, { z_medium: 3, z_high: 5 })).toBe("low");
    expect(severity(2.5, { z_medium: 1, z_high: 5 })).toBe("medium");
  });
});

describe("computeAnomalyCandidates", () => {
  const day = (i: number, v: number): SeriesPoint => ({
    date: new Date(2026, 3, i + 1),
    value: v,
  });
  it("emits no candidates when the last point is in-band", () => {
    const candidates = computeAnomalyCandidates([
      {
        metric: "revenue_net",
        series: [10, 11, 9, 10, 11, 9, 10, 11].map((v, i) => day(i, v)),
      },
    ]);
    expect(candidates).toHaveLength(0);
  });
  it("emits a high-severity candidate when the last point spikes", () => {
    const candidates = computeAnomalyCandidates([
      {
        metric: "ad_spend",
        series: [10, 11, 9, 10, 11, 9, 10, 100].map((v, i) => day(i, v)),
      },
    ]);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    if (!candidate) {
      throw new Error("expected one candidate");
    }
    expect(candidate.severity).toBe("high");
    expect(candidate.metric).toBe("ad_spend");
    expect(candidate.value).toBe(100);
  });
  it("skips metrics with insufficient history", () => {
    const candidates = computeAnomalyCandidates([
      {
        metric: "roas",
        series: [day(0, 1), day(1, 100)],
      },
    ]);
    expect(candidates).toHaveLength(0);
  });
});
