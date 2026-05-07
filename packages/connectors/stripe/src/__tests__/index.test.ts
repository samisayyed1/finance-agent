import { describe, expect, it } from "vitest";
import { stripeConnector } from "..";

describe("@ai-cfo/connector-stripe", () => {
  it("declares source = stripe", () => {
    expect(stripeConnector.source).toBe("stripe");
  });
  it("Day-0: webhook verification is not yet implemented", () => {
    expect.fail("not implemented");
  });
});
