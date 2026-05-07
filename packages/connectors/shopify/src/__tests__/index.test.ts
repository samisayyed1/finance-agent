import { describe, expect, it } from "vitest";
import { shopifyConnector } from "..";

describe("@ai-cfo/connector-shopify", () => {
  it("declares source = shopify", () => {
    expect(shopifyConnector.source).toBe("shopify");
  });
  it("Day-0: backfill is not yet implemented", () => {
    expect.fail("not implemented");
  });
});
