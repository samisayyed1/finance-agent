# Reconciliation operations

The reconciler matches canonical Orders ↔ Payments and emits flags for drift. Day-2 lights up `ORDER_MISSING_PAYMENT` and `PAYMENT_WITHOUT_ORDER`; `FEE_DRIFT` follows when the matched pair's amounts disagree by more than the tolerance.

## How matching works

`matchOrdersToPayments(orders, payments, options)` in `packages/reconcile/src/match.ts`:

- For each unmatched paid Order, find the unmatched Payment with the smallest `|Δ amount|`, breaking ties by the smallest `|Δ time|`.
- Defaults: `amountToleranceMinor = 1` (1¢), `timeToleranceMs = 30 * 60_000` (30 min).
- Each Payment matches at most one Order. Currency mismatch never matches.
- The matcher is **source-agnostic** (Iron Rule #10) — it operates on a typed `MatchOrder` / `MatchPayment` shape, not on Shopify or Stripe payloads. QuickBooks invoices ↔ Plaid bank deposits work the same way.

## Per-org tolerance overrides (Day-3+)

We will read `org_thresholds` for tighter or looser tolerance per brand:

| Threshold metric | Threshold kind | Effect |
| --- | --- | --- |
| `reconcile.amount_tolerance` | `floor` | Matcher uses this many cents for `amountToleranceMinor`. |
| `reconcile.time_tolerance_min` | `floor` | Matcher uses this many minutes for `timeToleranceMs`. |

Until Day-3, every org uses the defaults.

## When flags fire

- **`ORDER_MISSING_PAYMENT`** — operator placed an order in Shopify, financial_status = paid, but no Stripe charge within 30 min and within 1¢. Expected payment didn't arrive (or arrived elsewhere — check Stripe Dashboard).
- **`PAYMENT_WITHOUT_ORDER`** — Stripe charge succeeded, no Shopify order to match. Either an off-platform sale or a subscription renewal. The agent surfaces these as cash-in-without-source.
- **`FEE_DRIFT`** — Order total ≠ payment.gross + payment.fee. > 1¢ drift. Usually a tax or shipping mismatch. Day-3 polish.

## How operators resolve flags

Day-2: operators see flags in the dashboard's daily report; they click "Mark resolved" or "Dismiss" which writes `status = 'resolved' | 'dismissed'` on `reconciliation_flags`. The agent reads `agent_outcomes` per flag to learn whether its summary recommendations were acted on.

Day-3: bulk-resolve UI + auto-dismiss for known patterns (e.g., the merchant explicitly accepts a 0.50% fee drift on a high-volume SKU).

## Cron + on-event runs

- `ai-cfo.reconcile-day` — single-day run. Fired by `stripe-normalize` and `shopify-normalize` for each affected date.
- `ai-cfo.reconcile-window` — multi-day run. Fired at the end of `stripe-backfill` for the full 90-day window.
- A daily 04:30 UTC cron will run `reconcile-day` for `today() - 1` (Day-3; not yet wired).

## Idempotency

Flag rows are upserted by `flag_id` with `ON CONFLICT DO NOTHING`. Re-running reconciliation produces zero new rows; resolving a flag in the dashboard never gets undone by a re-run. The deterministic `flag_id` shape (`MISSING_PAY_<order_id>`, `PAY_NO_ORDER_<payment_id>`, `FEE_DRIFT_<order>_<payment>`) makes this trivial.
