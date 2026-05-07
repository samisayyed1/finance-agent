# ADR 0010 — Dinero.js for cent-exact monetary arithmetic

## Status
Accepted — 2026-05-07

## Context
Iron Rule #1 says the AI never computes a number; the deterministic truth layer does. That truth layer is in `packages/metrics` and `packages/reconcile`. Money in JavaScript's `Number` type silently rounds: `0.1 + 0.2 = 0.30000000000000004`. We cannot ship that to a CFO who's reconciling Stripe payouts to the cent.

## Decision
All monetary arithmetic uses **Dinero.js v2** (immutable, integer-amount + currency), with `@dinero.js/currencies` for the currency definitions and **decimal.js** for rate / ratio computations (ROAS, MER, refund rate). Cent-exact unit tests in `packages/metrics` cover every metric. No `number + number` in monetary code paths anywhere; lint rule should reject it (post-Day-0 work).

## Consequences
- Reconciliation code is verifiably correct under floating-point edge cases.
- Slight cognitive overhead: `dinero({ amount: 4200, currency: USD })` instead of `42.00`. Acceptable.
- Dinero.js v2 is in alpha (latest 2.0.x line); we pin tightly in `package.json` and watch for breaking changes.
- Our `packages/database/schema/daily_metrics` columns are `numeric(18,4)` — we serialize Dinero's integer-minor amounts back to decimal at the database boundary; that's the only conversion site.
