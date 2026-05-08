import { describe, expect, it } from "vitest";
import { costMicrosToDecimalString } from "../src/parse/cost-micros";

describe("costMicrosToDecimalString", () => {
  it("1234560000 → '1234.56'", () => {
    expect(costMicrosToDecimalString(1_234_560_000)).toBe("1234.56");
  });

  it("0 → '0.00'", () => {
    expect(costMicrosToDecimalString(0)).toBe("0.00");
  });

  it("100 → '0.00' (sub-cent rounds to 0)", () => {
    expect(costMicrosToDecimalString(100)).toBe("0.00");
  });

  it("12345678 → '12.35' (rounds half-up at 4th decimal)", () => {
    expect(costMicrosToDecimalString(12_345_678)).toBe("12.35");
  });

  it("-50000000 → '-50.00'", () => {
    expect(costMicrosToDecimalString(-50_000_000)).toBe("-50.00");
  });

  it("BigInt 9223372036854775000 → '9223372036854.78' (no precision loss)", () => {
    expect(costMicrosToDecimalString(9_223_372_036_854_775_000n)).toBe(
      "9223372036854.78"
    );
  });

  it("string '1234560000' → '1234.56' (Google sometimes serializes as string)", () => {
    expect(costMicrosToDecimalString("1234560000")).toBe("1234.56");
  });

  it("rejects non-integer strings", () => {
    expect(() => costMicrosToDecimalString("1234.56")).toThrow();
  });
});
