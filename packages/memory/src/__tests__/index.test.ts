const NOT_IMPLEMENTED_RE = /not implemented/;

import { describe, expect, it } from "vitest";
import { retrieveMemories, writeMemory } from "..";

describe("@ai-cfo/memory", () => {
  it("Day-0: writeMemory throws not-implemented", async () => {
    await expect(
      writeMemory({ orgId: "org-1", kind: "pattern", content: "x" })
    ).rejects.toThrow(NOT_IMPLEMENTED_RE);
  });
  it("Day-0: retrieveMemories throws not-implemented", async () => {
    await expect(
      retrieveMemories({ orgId: "org-1", query: "x" })
    ).rejects.toThrow(NOT_IMPLEMENTED_RE);
    expect.fail("not implemented");
  });
});
