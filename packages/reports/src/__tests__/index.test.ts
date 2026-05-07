import type { DailyReport } from "@ai-cfo/agent";
import { describe, expect, it } from "vitest";
import { toMarkdown, toSlackBlocks } from "..";

const fixture: DailyReport = {
  org_id: "org-1",
  date: "2026-05-07",
  snapshot_id: "snap-1",
  trace_id: "trace-abc",
  prompt_version: "v1",
  model: "claude-opus-4-7",
  content_md: "Placeholder report.",
  citations: [],
  recommendations: [],
};

describe("@ai-cfo/reports", () => {
  it("toMarkdown emits a header with the date", () => {
    expect(toMarkdown(fixture)).toContain("2026-05-07");
  });
  it("toSlackBlocks attaches feedback buttons keyed by trace_id", () => {
    const blocks = toSlackBlocks(fixture);
    const stringified = JSON.stringify(blocks);
    expect(stringified).toContain("feedback_positive_trace-abc");
    expect(stringified).toContain("feedback_negative_trace-abc");
    expect(stringified).toContain("feedback_correction_trace-abc");
  });
  it("Day-0: monthly PDF rendering is not implemented", () => {
    expect.fail("not implemented");
  });
});
