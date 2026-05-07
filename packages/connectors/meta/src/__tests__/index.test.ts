import { describe, expect, it } from "vitest";
import { metaConnector } from "..";

describe("@ai-cfo/connector-meta", () => {
  it("declares source = meta", () => {
    expect(metaConnector.source).toBe("meta");
  });
  it("Day-0: backfill is not yet implemented", () => {
    expect.fail("not implemented");
  });
});
