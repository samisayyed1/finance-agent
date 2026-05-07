import { describe, expect, it } from "vitest";
import { validateGrounding } from "..";

describe("validateGrounding", () => {
  it("accepts a fully-cited report", () => {
    const result = validateGrounding({
      org_id: "org-1",
      date: "2026-05-07",
      snapshot_id: "snap-1",
      trace_id: "t-1",
      prompt_version: "v1",
      model: "claude-opus-4-7",
      content_md: "Revenue was $42,000 (cited from snap-1).",
      citations: [{ kind: "snapshot", id: "snap-1", value: 42_000 }],
      recommendations: [],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a report with ungrounded numbers", () => {
    const result = validateGrounding({
      org_id: "org-1",
      date: "2026-05-07",
      snapshot_id: "snap-1",
      trace_id: "t-1",
      prompt_version: "v1",
      model: "claude-opus-4-7",
      content_md: "Revenue was $42,000 (cited) but ROAS was 3.5x (not cited).",
      citations: [{ kind: "snapshot", id: "snap-1", value: 42_000 }],
      recommendations: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.ungrounded).toContain("3.5");
    }
  });

  it("Day-0 placeholder failure reminds us createAgent is stubbed", () => {
    expect.fail("not implemented");
  });
});
