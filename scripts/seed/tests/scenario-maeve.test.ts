import { describe, expect, it } from "vitest";
import { maeveScenario, scenarioSchema } from "../scenario-maeve";

describe("scenario-maeve", () => {
  it("validates against the Zod schema cleanly", () => {
    expect(() => scenarioSchema.parse(maeveScenario)).not.toThrow();
  });

  it("produces ~$58k weekly revenue at the configured DOW pattern", () => {
    const dowSum = (
      Object.values(maeveScenario.dowMultipliers) as number[]
    ).reduce((a: number, b: number) => a + b, 0);
    const weekly = maeveScenario.baseRevenuePerDayUsd * dowSum;
    // 7 day base = 8200 * (0.6+0.95+1.2+1.05+1.4+0.9+0.85) = 8200 * 6.95 ≈ 56990
    expect(weekly).toBeGreaterThan(50_000);
    expect(weekly).toBeLessThan(65_000);
  });

  it("anomaly windows are non-overlapping (ignoring kind)", () => {
    const ranges = maeveScenario.anomalies.map((a) => ({
      kind: a.kind,
      lo: a.daysAgoEnd,
      hi: a.daysAgoStart,
    }));
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        if (!(a && b)) {
          continue;
        }
        const overlap = a.lo <= b.hi && b.lo <= a.hi;
        if (overlap) {
          throw new Error(
            `anomaly windows overlap: ${a.kind} [${a.lo}, ${a.hi}] vs ${b.kind} [${b.lo}, ${b.hi}]`
          );
        }
      }
    }
    expect(true).toBe(true);
  });
});
