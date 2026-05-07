const NOT_IMPLEMENTED_RE = /not implemented/;

import { describe, expect, it } from "vitest";
import { FLAG_KINDS, runReconciliation } from "..";

describe("@ai-cfo/reconcile", () => {
  it("declares all 7 flag kinds", () => {
    expect(FLAG_KINDS).toHaveLength(7);
  });
  it("reconcile: ORDER_MISSING_PAYMENT — not implemented", async () => {
    await expect(
      runReconciliation("org-stub", {
        from: new Date("2026-05-01"),
        to: new Date("2026-05-07"),
      })
    ).rejects.toThrow(NOT_IMPLEMENTED_RE);
    expect.fail("not implemented");
  });
});
