import { describe, expect, it } from "vitest";
import type { DailyReport } from "../src/contracts/daily-report";
import { validateGrounding } from "../src/grounding/validator";

const baseReport: DailyReport = {
  org_id: "11111111-2222-4333-8444-555555555555",
  date: "2026-05-07",
  snapshot_id: "snap-1",
  headline: {
    metric: "revenue_net",
    value: "$42,000.00",
    delta_pct: 12.5,
    trend: "up",
    citation: { kind: "snapshot", snapshot_id: "snap-1" },
  },
  summary:
    "Revenue closed at $42,000.00 [snapshot:snap-1], up 12.5% [snapshot:snap-1].",
  top_movers: [
    {
      metric: "revenue_gross",
      value: "$45,200.00",
      delta_abs: "$5,200.00",
      delta_pct: 13.0,
      direction: "positive",
      narrative:
        "Revenue gross hit $45,200.00 [snapshot:snap-1], a 13.0% lift [snapshot:snap-1].",
      citations: [{ kind: "snapshot", snapshot_id: "snap-1" }],
    },
  ],
  flags: [
    {
      flag_id: "MISSING_PAY_abc",
      kind: "ORDER_MISSING_PAYMENT",
      severity: "medium",
      narrative:
        "One order missed a $215.92 [flag:MISSING_PAY_abc] Stripe charge.",
      citation: { kind: "flag", flag_id: "MISSING_PAY_abc" },
    },
  ],
  actions: [
    {
      title: "Investigate flag",
      reasoning: "The $215.92 [flag:MISSING_PAY_abc] order needs follow-up.",
      irreversible: false,
      citations: [{ kind: "flag", flag_id: "MISSING_PAY_abc" }],
    },
  ],
  sync_health: [
    {
      source: "shopify",
      status: "green",
      last_synced_at: "2026-05-07T14:00:00.000Z",
    },
  ],
  metadata: {
    model: "claude-opus-4-7",
    prompt_version: "daily-report-v1",
    generated_at: "2026-05-08T07:00:00.000Z",
    trace_id: "trace-1",
  },
};

const validTrace = {
  snapshot_ids: new Set(["snap-1"]),
  anomaly_ids: new Set<string>(),
  flag_ids: new Set(["MISSING_PAY_abc"]),
  memory_ids: new Set<string>(),
};

describe("validateGrounding", () => {
  it("accepts a fully-cited report", () => {
    const result = validateGrounding(baseReport, validTrace);
    expect(result.ok).toBe(true);
  });

  it("rejects when summary has an uncited number", () => {
    const r = {
      ...baseReport,
      summary: "Revenue was $42,000.00 [snapshot:snap-1] but ROAS was 3.5x.",
    };
    const result = validateGrounding(r, validTrace);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const missing = result.errors.find(
        (e) => e.kind === "missing_inline_citation"
      );
      expect(missing).toBeDefined();
    }
  });

  it("rejects when an inline citation references an id not in the trace", () => {
    const r = {
      ...baseReport,
      summary:
        "Revenue closed at $42,000.00 [snapshot:fabricated-id], up 12.5% [snapshot:snap-1].",
    };
    const result = validateGrounding(r, validTrace);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const notInTrace = result.errors.find(
        (e) => e.kind === "citation_not_in_trace"
      );
      expect(notInTrace).toBeDefined();
    }
  });

  it("rejects when a top-level structural citation is not in the trace", () => {
    const r = {
      ...baseReport,
      headline: {
        ...baseReport.headline,
        citation: { kind: "snapshot" as const, snapshot_id: "fabricated" },
      },
    };
    const result = validateGrounding(r, validTrace);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find(
        (e) =>
          e.kind === "citation_not_in_trace" && e.field === "headline.citation"
      );
      expect(err).toBeDefined();
    }
  });

  it("ignores numeric tokens inside citation markers themselves", () => {
    // The marker `[snapshot:snap-2026-05-07]` contains digits; they should
    // not be treated as ungrounded tokens.
    const r = {
      ...baseReport,
      summary: "Revenue closed at $42,000.00 [snapshot:snap-1].",
    };
    const result = validateGrounding(r, validTrace);
    expect(result.ok).toBe(true);
  });

  it("accepts a flag narrative with the inline flag citation", () => {
    const result = validateGrounding(baseReport, validTrace);
    expect(result.ok).toBe(true);
  });

  it("rejects an action whose citation doesn't match a tool result", () => {
    const action0 = baseReport.actions[0];
    if (!action0) {
      throw new Error("expected baseReport to have an action");
    }
    const r = {
      ...baseReport,
      actions: [
        {
          ...action0,
          citations: [{ kind: "flag" as const, flag_id: "fabricated-flag" }],
        },
      ],
    };
    const result = validateGrounding(r, validTrace);
    expect(result.ok).toBe(false);
  });
});
