const NOT_IMPLEMENTED_RE = /not implemented/;

import { describe, expect, it } from "vitest";
import { sendEmail } from "..";

describe("@ai-cfo/delivery", () => {
  it("Day-0: sendEmail throws not-implemented", async () => {
    await expect(
      sendEmail({
        traceId: "t-1",
        to: "ops@example.com",
        subject: "test",
        html: "<p>x</p>",
      })
    ).rejects.toThrow(NOT_IMPLEMENTED_RE);
    expect.fail("not implemented");
  });
});
