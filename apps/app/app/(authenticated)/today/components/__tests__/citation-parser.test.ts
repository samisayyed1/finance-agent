import { describe, expect, it } from "vitest";
import { harvestCitedIds, parseCitations } from "../citation-parser";

describe("parseCitations", () => {
  it("returns an empty array for an empty string", () => {
    expect(parseCitations("")).toEqual([]);
  });

  it("returns one text segment when no citations are present", () => {
    expect(parseCitations("hello world")).toEqual([
      { kind: "text", text: "hello world" },
    ]);
  });

  it("tokenises a single trailing citation", () => {
    const result = parseCitations("Revenue $42,000 [snapshot:abc-123]");
    expect(result).toEqual([
      { kind: "text", text: "Revenue $42,000 " },
      {
        kind: "citation",
        citationKind: "snapshot",
        id: "abc-123",
        raw: "[snapshot:abc-123]",
      },
    ]);
  });

  it("tokenises multiple citations of different kinds", () => {
    const md =
      "Open [flag:f1] · ROAS 3.5x [snapshot:s1] · spike [anomaly:a1] today.";
    const result = parseCitations(md);
    const kinds = result.map((s) => s.kind);
    expect(kinds).toEqual([
      "text",
      "citation",
      "text",
      "citation",
      "text",
      "citation",
      "text",
    ]);
    const citations = result.filter((s) => s.kind === "citation");
    expect(citations.map((c) => (c as { id: string }).id)).toEqual([
      "f1",
      "s1",
      "a1",
    ]);
  });

  it("preserves ids that contain digits, dots, hyphens, underscores, colons", () => {
    const result = parseCitations("[snapshot:snap_2026-05-07:org.42]");
    expect(result).toHaveLength(1);
    const c = result[0];
    if (c?.kind !== "citation") {
      throw new Error("expected citation");
    }
    expect(c.id).toBe("snap_2026-05-07:org.42");
  });

  it("does not consume a literal bracket that isn't a valid citation", () => {
    expect(parseCitations("note [TODO] follow up")).toEqual([
      { kind: "text", text: "note [TODO] follow up" },
    ]);
  });

  it("can be called repeatedly without leaking regex state", () => {
    parseCitations("Revenue $42 [snapshot:a]");
    const result = parseCitations("Revenue $42 [snapshot:a]");
    const citations = result.filter((s) => s.kind === "citation");
    expect(citations).toHaveLength(1);
  });
});

describe("harvestCitedIds", () => {
  it("returns empty buckets when no citations are present", () => {
    expect(harvestCitedIds("plain text")).toEqual({
      snapshot: [],
      anomaly: [],
      flag: [],
      memory: [],
    });
  });

  it("dedupes ids per kind", () => {
    const md = "[snapshot:s1] then later [snapshot:s1] and [flag:f1]";
    const result = harvestCitedIds(md);
    expect(result.snapshot).toEqual(["s1"]);
    expect(result.flag).toEqual(["f1"]);
    expect(result.anomaly).toEqual([]);
    expect(result.memory).toEqual([]);
  });

  it("groups by kind", () => {
    const md =
      "[snapshot:a] [snapshot:b] [anomaly:x] [anomaly:y] [flag:m] [memory:p]";
    const result = harvestCitedIds(md);
    expect(result.snapshot.sort()).toEqual(["a", "b"]);
    expect(result.anomaly.sort()).toEqual(["x", "y"]);
    expect(result.flag).toEqual(["m"]);
    expect(result.memory).toEqual(["p"]);
  });
});
