import { describe, expect, it } from "vitest";
import { makeRng } from "../rng";
import { maeveScenario } from "../scenario-maeve";
import { type SynthesisWindow, synthesizeOrders } from "../synthesize-orders";

const FIXED_END = new Date(Date.UTC(2026, 4, 7));
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const ninetyDayWindow: SynthesisWindow = {
  start: new Date(FIXED_END.getTime() - 89 * ONE_DAY_MS),
  end: FIXED_END,
};

describe("synthesizeOrders — determinism", () => {
  it("same seed produces identical output across runs", () => {
    const a = synthesizeOrders(
      maeveScenario,
      makeRng("test-seed-v1"),
      ninetyDayWindow
    );
    const b = synthesizeOrders(
      maeveScenario,
      makeRng("test-seed-v1"),
      ninetyDayWindow
    );
    expect(a.length).toBe(b.length);
    expect(a).toEqual(b);
  });
});

describe("synthesizeOrders — sizing", () => {
  it("90-day total revenue lands within ±20% of $750k target", () => {
    const orders = synthesizeOrders(
      maeveScenario,
      makeRng("size-seed"),
      ninetyDayWindow
    );
    const totalUsd =
      orders
        .filter(
          (o) => o.cancelledAtSource === null && o.financialStatus !== "pending"
        )
        .reduce((s, o) => s + o.totalMinor, 0) / 100;
    expect(totalUsd).toBeGreaterThan(600_000);
    expect(totalUsd).toBeLessThan(900_000);
  });
});

describe("synthesizeOrders — DOW pattern", () => {
  it("Tuesdays beat Mondays; Sundays trail weekday average", () => {
    const orders = synthesizeOrders(
      maeveScenario,
      makeRng("dow-seed"),
      ninetyDayWindow
    );
    const byDow = new Map<number, number[]>();
    for (const o of orders) {
      if (o.cancelledAtSource !== null || o.financialStatus === "pending") {
        continue;
      }
      const dow = o.createdAtSource.getUTCDay();
      const arr = byDow.get(dow) ?? [];
      arr.push(o.totalMinor);
      byDow.set(dow, arr);
    }
    const avg = (arr: number[] | undefined): number =>
      arr && arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    // Sum by DOW (revenue, not avg per order — DOW pattern multiplies count).
    const sum = (arr: number[] | undefined): number =>
      arr ? arr.reduce((s, v) => s + v, 0) : 0;

    const tueSum = sum(byDow.get(2));
    const monSum = sum(byDow.get(1));
    const sunSum = sum(byDow.get(0));
    const wkdayAvg =
      [1, 2, 3, 4, 5].reduce((s, d) => s + sum(byDow.get(d)), 0) / 5;

    expect(tueSum).toBeGreaterThan(monSum);
    expect(sunSum).toBeLessThan(wkdayAvg);
    // Avoid unused-var lint on `avg`
    expect(avg(byDow.get(4))).toBeGreaterThan(0);
  });
});

describe("synthesizeOrders — attribution distribution", () => {
  it("channel mix lands within ±5pts of scenario target", () => {
    const orders = synthesizeOrders(
      maeveScenario,
      makeRng("attrib-seed"),
      ninetyDayWindow
    );
    const counts = new Map<string, number>();
    for (const o of orders) {
      counts.set(
        o.attributionChannel,
        (counts.get(o.attributionChannel) ?? 0) + 1
      );
    }
    const total = orders.length;
    for (const [channel, target] of Object.entries(maeveScenario.attribution)) {
      const observed = (counts.get(channel) ?? 0) / total;
      expect(Math.abs(observed - target)).toBeLessThan(0.05);
    }
  });
});

describe("synthesizeOrders — anomaly windows fire", () => {
  it("new-customer-surge day has ~3× order count", () => {
    const orders = synthesizeOrders(
      maeveScenario,
      makeRng("anomaly-seed"),
      ninetyDayWindow
    );
    const surgeDayMs = FIXED_END.getTime() - 30 * ONE_DAY_MS;
    const surgeDay = new Date(
      Date.UTC(
        new Date(surgeDayMs).getUTCFullYear(),
        new Date(surgeDayMs).getUTCMonth(),
        new Date(surgeDayMs).getUTCDate()
      )
    );
    const sameDow = surgeDay.getUTCDay();

    const dayBuckets = new Map<string, number>();
    for (const o of orders) {
      const k = new Date(
        Date.UTC(
          o.createdAtSource.getUTCFullYear(),
          o.createdAtSource.getUTCMonth(),
          o.createdAtSource.getUTCDate()
        )
      ).toISOString();
      dayBuckets.set(k, (dayBuckets.get(k) ?? 0) + 1);
    }
    const surgeCount = dayBuckets.get(surgeDay.toISOString()) ?? 0;
    const sameDowCounts: number[] = [];
    for (const [k, n] of dayBuckets) {
      const d = new Date(k);
      if (d.getUTCDay() === sameDow && k !== surgeDay.toISOString()) {
        sameDowCounts.push(n);
      }
    }
    const baseline =
      sameDowCounts.reduce((s, v) => s + v, 0) /
      Math.max(sameDowCounts.length, 1);
    expect(surgeCount).toBeGreaterThan(2 * baseline);
  });
});
