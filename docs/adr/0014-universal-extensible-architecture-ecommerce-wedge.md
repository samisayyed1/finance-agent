# ADR 0014 — Universal-extensible architecture; ecommerce is the wedge

## Status
Accepted — 2026-05-07

## Context
Iron Rule #10. The wedge is ecommerce — $50k–$2M/mo Shopify + Stripe + Meta + Google brands, and the agencies / fractional CFOs serving them. The endgame is universal: any business that takes money in and out. If we hard-code ecommerce assumptions ("there is always an `ad_spend`", "every transaction has a `stripe_charge_id`"), we'll re-platform in twelve months.

## Decision
- Connectors implement a **uniform `Connector<RawEvent, Normalized>` interface** in `@ai-cfo/shared`. Adding QuickBooks / Xero / NetSuite / Plaid is a new package that satisfies the same interface — no schema migrations, no metric-engine rewrites.
- **Schema columns are generic.** `daily_metrics` has `revenue_net`, `gross_margin`, `contribution_profit`, `orders` — concepts that exist in any business. There is no `shopify_order_id` column on a top-level table. Source-specific data lives in `raw_payloads.r2_key` (immutable) and structured `data` JSONB inside source-specific normalized rows.
- **`packages/metrics`, `packages/reconcile`, `packages/agent` are vertical-agnostic.** They consume `daily_metrics` and `reconciliation_flags` rows; they don't know which connector populated them.
- **The closed-loop applies to any vertical.** `agent_traces` / `agent_memories` / `agent_feedback` / `agent_outcomes` / `org_eval_set` / `org_thresholds` are not ecommerce-shaped.

## Consequences
- Adding a new vertical (e.g., a B2B SaaS company on QuickBooks + Stripe + HubSpot) requires: a new connector package, optional new normalized event kinds, possibly an extra metric or two. No restructuring.
- The PR template forces every reviewer to answer "does this introduce ecommerce-specific assumptions in metrics/reconcile/agent?" — an explicit guardrail.
- Tradeoff: we don't get to take shortcuts that would only work for Shopify-shaped data. Day-0 cost is real; Day-365 payoff is enormous.
