const NOT_IMPLEMENTED_RE = /not implemented/;

import { describe, expect, it } from "vitest";
import { compute_daily_metrics } from "..";

describe("@ai-cfo/metrics", () => {
  it("metrics: revenue_net (typical day) — not implemented", async () => {
    await expect(
      compute_daily_metrics("org-stub", new Date("2026-05-07"))
    ).rejects.toThrow(NOT_IMPLEMENTED_RE);
    expect.fail("not implemented");
  });
});
