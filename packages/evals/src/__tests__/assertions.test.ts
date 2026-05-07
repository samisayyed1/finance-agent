import { describe, expect, it } from "vitest";
import { featureRecall, groundingRate, hasCitations } from "..";

describe("@ai-cfo/evals — assertions", () => {
  it("groundingRate scores 1.0 when every numeric token is cited", () => {
    const result = groundingRate("Revenue was $42,000.", {
      vars: {
        fixture: {
          citations: [{ kind: "snapshot", id: "s1", value: 42_000 }],
        },
      },
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it("featureRecall scores partial when only some features mentioned", () => {
    const result = featureRecall("Refund rate climbed to 8.7%.", {
      vars: {
        fixture: { expected_features: ["refund rate", "MER", "ROAS"] },
      },
    });
    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(1 / 3, 4);
  });

  it("hasCitations passes when fixture has at least one citation", () => {
    const result = hasCitations("anything", {
      vars: { fixture: { citations: [{ value: 42 }] } },
    });
    expect(result.pass).toBe(true);
  });

  it("hasCitations fails when fixture has zero citations", () => {
    const result = hasCitations("anything", {
      vars: { fixture: { citations: [] } },
    });
    expect(result.pass).toBe(false);
  });
});
