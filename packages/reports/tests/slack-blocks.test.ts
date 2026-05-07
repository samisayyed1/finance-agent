import { describe, expect, it } from "vitest";
import { toSlackBlocks } from "../src/slack-blocks";
import { fixture } from "./fixture";

describe("toSlackBlocks", () => {
  const blocks = toSlackBlocks(fixture);

  it("emits a header block with the date", () => {
    const header = blocks.find((b) => b.type === "header");
    expect(header).toBeDefined();
    expect(JSON.stringify(header)).toContain("2026-05-07");
  });

  it("emits an action row with feedback buttons keyed by trace_id", () => {
    const actionsRow = blocks.find((b) => b.type === "actions");
    expect(actionsRow).toBeDefined();
    const stringified = JSON.stringify(actionsRow);
    expect(stringified).toContain(
      `feedback_positive_${fixture.metadata.trace_id}`
    );
    expect(stringified).toContain(
      `feedback_negative_${fixture.metadata.trace_id}`
    );
    expect(stringified).toContain(
      `feedback_correction_${fixture.metadata.trace_id}`
    );
  });

  it("includes every top-mover narrative as a section block", () => {
    for (const m of fixture.top_movers) {
      const found = blocks.some(
        (b) =>
          b.type === "section" &&
          "text" in b &&
          b.text &&
          "text" in b.text &&
          (b.text.text as string).includes(m.narrative)
      );
      expect(found).toBe(true);
    }
  });

  it("includes flag severity emoji", () => {
    const stringified = JSON.stringify(blocks);
    // Medium severity flag → 🟡
    expect(stringified).toContain("🟡");
  });

  it("rejects a malformed DailyReport (Zod schema gate)", () => {
    const bad = {
      ...fixture,
      headline: { ...fixture.headline, value: "not a money string" },
    } as unknown as typeof fixture;
    expect(() => toSlackBlocks(bad)).toThrow();
  });
});
