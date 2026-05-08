import { describe, expect, it } from "vitest";
import { type DistillerDeps, distillTracesIntoMemories } from "../src/distill";

describe("distillTracesIntoMemories", () => {
  it("returns [] when input is empty (no Anthropic call)", async () => {
    let called = false;
    const deps: DistillerDeps = {
      callModel: () => {
        called = true;
        return Promise.resolve("");
      },
    };
    const out = await distillTracesIntoMemories(
      { orgName: "Acme", traces: [], feedback: [], outcomes: [] },
      deps
    );
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("parses + filters Haiku output by confidence floor (default 0.55)", async () => {
    const fixture = JSON.stringify({
      memories: [
        {
          kind: "pattern",
          content: "Tue/Thu peak revenue is a stable weekly pattern.",
          confidence: 0.82,
          source_trace_id: "trace_2026-05-06_abc",
        },
        {
          kind: "preference",
          content: "Operator prefers % framing.",
          confidence: 0.95,
        },
        {
          kind: "vendor_quirk",
          content: "Possibly slow 3PL.",
          confidence: 0.4, // below floor — should be dropped
        },
      ],
    });
    const deps: DistillerDeps = {
      callModel: () => Promise.resolve(fixture),
    };
    const out = await distillTracesIntoMemories(
      {
        orgName: "Acme",
        traces: [
          {
            trace_id: "trace_2026-05-06_abc",
            date: "2026-05-06",
            output_jsonb: { report: { summary: "Net revenue $3,958..." } },
          },
        ],
        feedback: [
          {
            trace_id: "trace_2026-05-06_abc",
            signal: "correction",
            message: "12% Sunday drop is normal — Sabbath observance.",
            channel: "slack",
          },
        ],
        outcomes: [],
      },
      deps
    );
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.kind)).toEqual(["pattern", "preference"]);
    expect(out[0].source_trace_id).toBe("trace_2026-05-06_abc");
  });

  it("strips ```json fences from the model output", async () => {
    const fixture =
      "```json\n" +
      JSON.stringify({
        memories: [{ kind: "pattern", content: "...", confidence: 0.7 }],
      }) +
      "\n```";
    const deps: DistillerDeps = {
      callModel: () => Promise.resolve(fixture),
    };
    const out = await distillTracesIntoMemories(
      {
        orgName: "Acme",
        traces: [
          {
            trace_id: "trace_x",
            date: "2026-05-06",
            output_jsonb: {},
          },
        ],
        feedback: [],
        outcomes: [],
      },
      deps
    );
    expect(out).toHaveLength(1);
  });

  it("returns [] on invalid JSON output", async () => {
    const deps: DistillerDeps = {
      callModel: () => Promise.resolve("Sure, here's some thoughts: ..."),
    };
    const out = await distillTracesIntoMemories(
      {
        orgName: "Acme",
        traces: [{ trace_id: "x", date: "2026-05-06", output_jsonb: {} }],
        feedback: [],
        outcomes: [],
      },
      deps
    );
    expect(out).toEqual([]);
  });

  it("respects confidenceFloor override", async () => {
    const fixture = JSON.stringify({
      memories: [
        { kind: "pattern", content: "x", confidence: 0.6 },
        { kind: "preference", content: "y", confidence: 0.8 },
      ],
    });
    const deps: DistillerDeps = {
      callModel: () => Promise.resolve(fixture),
      confidenceFloor: 0.7,
    };
    const out = await distillTracesIntoMemories(
      {
        orgName: "Acme",
        traces: [{ trace_id: "x", date: "2026-05-06", output_jsonb: {} }],
        feedback: [],
        outcomes: [],
      },
      deps
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("preference");
  });
});
