const NOT_IMPLEMENTED_RE = /not implemented/;

import { describe, expect, it } from "vitest";
import { recordFeedback } from "..";

describe("@ai-cfo/feedback", () => {
  it("Day-0: recordFeedback throws not-implemented", async () => {
    await expect(
      recordFeedback({
        orgId: "org-1",
        traceId: "t-1",
        signal: "positive",
        channel: "slack",
      })
    ).rejects.toThrow(NOT_IMPLEMENTED_RE);
    expect.fail("not implemented");
  });
});
