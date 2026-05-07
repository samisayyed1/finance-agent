import { describe, expect, it } from "vitest";
import { toMarkdown } from "../src/markdown";
import { fixture } from "./fixture";

describe("toMarkdown", () => {
  const md = toMarkdown(fixture);

  it("emits the date in the header", () => {
    expect(md).toContain("Daily report — 2026-05-07");
  });

  it("includes every top mover narrative", () => {
    for (const m of fixture.top_movers) {
      expect(md).toContain(m.narrative);
    }
  });

  it("includes every flag narrative", () => {
    for (const f of fixture.flags) {
      expect(md).toContain(f.narrative);
      expect(md).toContain(f.kind);
    }
  });

  it("includes every action title", () => {
    for (const a of fixture.actions) {
      expect(md).toContain(a.title);
    }
  });

  it("ends with a References section listing every cited id", () => {
    expect(md).toContain("## References");
    expect(md).toContain("snap-2026-05-07");
    expect(md).toContain("MISSING_PAY_abc-123");
  });

  it("rejects a malformed DailyReport (Zod schema gate)", () => {
    const bad = { ...fixture, summary: "" } as unknown as typeof fixture;
    expect(() => toMarkdown(bad)).toThrow();
  });
});
