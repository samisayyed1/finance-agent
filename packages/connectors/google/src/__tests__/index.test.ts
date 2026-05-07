import { describe, expect, it } from "vitest";
import { googleConnector } from "..";

describe("@ai-cfo/connector-google", () => {
  it("declares source = google", () => {
    expect(googleConnector.source).toBe("google");
  });
  it("Day-0: parseEvent is not yet implemented", () => {
    expect.fail("not implemented");
  });
});
