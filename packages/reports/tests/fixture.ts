import type { DailyReport } from "@ai-cfo/agent";

export const fixture: DailyReport = {
  org_id: "11111111-2222-4333-8444-555555555555",
  date: "2026-05-07",
  snapshot_id: "snap-2026-05-07",
  headline: {
    metric: "revenue_net",
    value: "$42,000.00",
    delta_pct: 12.5,
    trend: "up",
    citation: { kind: "snapshot", snapshot_id: "snap-2026-05-07" },
  },
  summary:
    "Revenue closed at $42,000.00 [snapshot:snap-2026-05-07], up 12.5% [snapshot:snap-2026-05-07] vs last week's average. Two refunds drove a small drag.",
  top_movers: [
    {
      metric: "revenue_gross",
      value: "$45,200.00",
      delta_abs: "$5,200.00",
      delta_pct: 13.0,
      direction: "positive",
      narrative:
        "Revenue gross hit $45,200.00 [snapshot:snap-2026-05-07], a 13.0% lift. Driven by a single high-AOV order.",
      citations: [{ kind: "snapshot", snapshot_id: "snap-2026-05-07" }],
    },
    {
      metric: "refund_rate",
      value: "$3,200.00",
      delta_abs: "$1,800.00",
      delta_pct: 130.0,
      direction: "negative",
      narrative:
        "Refunds totaled $3,200.00 [snapshot:snap-2026-05-07], 130.0% above the 7-day mean. Worth a closer look at SKU returns.",
      citations: [{ kind: "snapshot", snapshot_id: "snap-2026-05-07" }],
    },
  ],
  flags: [
    {
      flag_id: "MISSING_PAY_abc-123",
      kind: "ORDER_MISSING_PAYMENT",
      severity: "medium",
      narrative:
        "One order didn't reconcile with a Stripe charge — likely a payment hold [flag:MISSING_PAY_abc-123].",
      citation: { kind: "flag", flag_id: "MISSING_PAY_abc-123" },
    },
  ],
  actions: [
    {
      title: "Review SKU returns",
      reasoning:
        "Refund rate is 130.0% [snapshot:snap-2026-05-07] above baseline. Pull the top three returned SKUs and check fulfillment quality.",
      irreversible: false,
      citations: [{ kind: "snapshot", snapshot_id: "snap-2026-05-07" }],
    },
  ],
  sync_health: [
    {
      source: "shopify",
      status: "green",
      last_synced_at: "2026-05-07T14:00:00.000Z",
    },
    {
      source: "stripe",
      status: "green",
      last_synced_at: "2026-05-07T14:00:00.000Z",
    },
  ],
  metadata: {
    model: "claude-opus-4-7",
    prompt_version: "daily-report-v1",
    generated_at: "2026-05-08T07:00:00.000Z",
    trace_id: "trace_2026-05-07_abc",
  },
};
