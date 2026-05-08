# ADR 0018 — Attribution mismatch as a reconciliation flag, not a metric

## Status
Accepted — 2026-05-08

## Context
Day-5 closed the ad-spend half of the truth layer. The first thing operators want to know is "do my ad-platform-reported conversions match the orders Shopify saw?" The drift between the two is *the* signal that something needs investigation: a Pixel double-fire, an iOS 14.5+ tracking gap, an attribution-window mismatch, a CDN that strips UTMs.

We had to choose where this signal lives.

**Option A** — make it a `daily_metrics` column (e.g. `meta_attribution_drift_pct`). Pro: queryable, cite-able, plots on a chart. Con: it's not a *quantity an operator trusts about their business*, it's a *check on data integrity* — and the same metric column couldn't represent the per-source/per-day shape (Meta drift is one signal, Google drift is another, on the same day).

**Option B** — make it a `reconciliation_flags.kind`, alongside `ORDER_MISSING_PAYMENT` and friends. Pro: it's an *alert* with severity, lifecycle (open / investigating / resolved / dismissed), and per-flag operator notes. The bulk-resolve UI we already need for the existing reconciliation flags applies for free. The agent can `get_reconciliation_flags` and cite individual `[flag:ATTR_meta_20260508_d4e48133]` markers in its narrative — same path it uses for payment / refund flags.

## Decision
Option B. New flag kind `ATTRIBUTION_MISMATCH`. The detection is a pure function (`detectAttributionMismatch`) operating on canonical `AdMetricDailySummary[]` + `OrderForAttribution[]` shapes — no Meta/Google-specific assumptions, iron rule #10. Default thresholds: drift ≥ 25% AND absolute delta ≥ 3 conversions, severity scale low (25-30%) / medium (30-50%) / high (≥ 50%). Per-org override via `org_thresholds` (Day 7+).

The `flag_id` template `ATTR_{ad_source}_{YYYYMMDD}_{orgId8}` makes re-runs idempotent (same date + source → same flag, ON CONFLICT DO UPDATE refreshes the actuals).

## Consequences

- **Cleaner separation** between cent-exact metrics (numbers operators trust) and signals (things operators investigate). Two distinct UX patterns: chart vs flag list.
- **Thresholds are first-class.** The default 25%/3 is engineered for a single-org SMB cohort; design partners with thousands of conversions/day will need higher absolute deltas or % drift will be too noisy. `org_thresholds` is the seam.
- **Operator workflow inherits Day-6 bulk-resolve**: select 7 attribution flags, click "Snooze 7 days," they disappear from the morning report for a week. Pixel debug? "Mark as Investigate" surfaces them in a dedicated tab.
- **The agent learns to lead with attribution flags** when present (prompt addendum). Day-5's prompt steered top_movers to ROAS/MER; Day-6's prompt now steers `flags[]` to lead with ATTRIBUTION_MISMATCH and recommend INVESTIGATION (Pixel debug, iOS 14.5+ analysis, attribution-window check) — never campaign changes based on drift alone.
- **Per-source observability**: `meta` drift and `google` drift are independent flags on the same day — operators see exactly which platform's tracking is off.

## Alternatives considered

- **Composite "data integrity score"**: rejected for the same reason ADR 0016 rejected a composite "agent quality" score — operators don't trust opaque numbers, and we lose the diagnostic granularity.
- **Detect drift inside the agent prompt**: rejected (iron rule #1 — the LLM never computes a number).
- **Detect drift in `compute_daily_metrics`**: rejected — `daily_metrics` is for trustable quantities; an alert is the wrong shape there.

## Related
- `packages/reconcile/src/attribution-match.ts` — pure detection function.
- `packages/connectors/shopify/src/parse/attribution.ts` — `inferMarketingSource` heuristic.
- `packages/agent/src/prompts/daily-report-v1.md` — operator-facing prompt addendum.
- `docs/runbooks/ATTRIBUTION_TROUBLESHOOTING.md` — operator-facing diagnostic playbook.
- ADR 0016 (closed-loop measurement)
- ADR 0011 (closed-loop is the moat)
