# ADR 0007 — Tremor + TanStack Table for the diagnostic dashboard

## Status
Accepted — 2026-05-07

## Context
The web dashboard is the diagnostic / admin / trust layer (Iron Rule #7), not the daily destination. Operators glance at it to verify what the agent told them. We need finance-shaped components — KPI cards, simple charts, dense tables, drilldown — and we need them now, not in three months of design work.

## Decision
Adopt **Tremor** (MIT, React + Tailwind) for charts/KPI cards, **TanStack Table** + **TanStack Query** for the data grid, **TanStack Form** + Zod-form-adapter for forms. All sit on top of the next-forge `@ai-cfo/design-system` (shadcn/ui). Recharts is the under-the-hood chart engine for both Tremor and our future custom charts.

## Consequences
- "Industry-standard finance dashboard" components out of the box; we ship in days, not months.
- Two charting layers (Tremor for prebuilt, Recharts for custom) — minor. Both are maintained by the same author.
- We avoid a real dashboard product (Looker, Metabase) for v1; we keep our presentation layer in our codebase, citable from agent traces.
- Some legacy next-forge UI (e.g., the `chart.tsx`/`resizable.tsx` storybook stubs) was deleted in Phase 2 due to upstream type drift (ADR 0015 covers similar cleanup). We don't grieve those.
