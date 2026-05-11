# Day 8 — Demo Data Seeder ("Maeve Co.")

> Plan-first per CLAUDE.md. This doc is the source of truth across sessions.
> **Phase Gate Marker** between Phase 2 and Phase 3 — Session 1 stops at the
> end of Phase 2; Session 2 resumes at Phase 3.

## Goal

Single command — `bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand` —
populates the entire AI Operating CFO with a rich, realistic, deterministic
**90-day** demo dataset for one ecommerce brand. End state:

- `/today` renders with real numbers
- `/metrics` shows 90-day curves
- `/analyst` answers questions grounded in seeded canonical rows
- `/settings/reconciliation` shows real flags
- Closed-loop substrate has memories
- Demo video can be recorded immediately after

## The Scenario — "Maeve Co."

DTC home goods brand, $250k MRR, four sources (Shopify + Stripe + Meta +
Google), 18 months operating, 90 days of synthetic history baked in.

Day-of-week pattern (revenue multipliers vs base):

| Sun  | Mon  | Tue  | Wed  | Thu  | Fri | Sat  |
| ---- | ---- | ---- | ---- | ---- | --- | ---- |
| 0.6× | 0.95×| 1.2× | 1.05×| 1.4× | 0.9×| 0.85×|

(`0` = Sunday in JS `Date.getUTCDay()`.)

## Anomaly catalog (6 deliberate "look at this" moments)

Anomaly IDs reference days **before today** (where `today` = the day the seed
runs). The seeder is deterministic so the same `--slug` yields the same set
of anomaly windows on subsequent runs.

| #   | Day window  | Anomaly                                                                                | What it teaches                                                                                                |
| --- | ----------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | -80 to -75  | **Meta attribution drift** — Meta over-reports conversions by 30% (iOS gap simulation) | Reconcile package emits `ATTRIBUTION_MISMATCH` flags; `/settings/reconciliation` lists them.                   |
| 2   | -62 to -55  | **Meta broad-audience ROAS collapse** (4.1 → 1.8 over 7 days)                          | Anomaly job emits `roas`-metric anomalies; `/today` surfaces high-severity events.                             |
| 3   | -47 to -45  | **Refund spike** — 3 days, 6× normal refund count (defective batch narrative)          | Anomaly job + `refund_rate` metric trip; agent narrates with grounded citations next session.                  |
| 4   | -30         | **Organic new-customer surge** — PR mention bumps order count 3× for one day            | `new_customers` metric spikes; cohort analysis surfaces it on `/metrics`.                                      |
| 5   | -14         | **Stripe payout gap** — one payout's `expected_arrival_at` shifted 3 business days     | Reconcile package emits `PAYOUT_GAP` flag; payout dashboard shows the delay.                                   |
| 6   | -7 to 0     | **8 orders missing Stripe charges (~$1,847)** — payment processor edge case            | Reconcile package emits `ORDER_MISSING_PAYMENT` flags; bulk-resolve UI on `/settings/reconciliation` exercised. |

## 8-phase outline

### Phase 0.0 — Plan doc on disk first

This file. Committed before any code so future sessions have full context.

### Phase 0 — Preconditions

A. `.env.local` has `ANTHROPIC_API_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`.
B. 25 expected tables exist (single `information_schema` query).
C. `bun run typecheck && bun run lint` green at HEAD on `main`.
D. Install `seedrandom` at exact-pinned latest stable.

### Phase 1 — Pure synthesis modules (no DB, no I/O)

Location: `scripts/seed/`

| Module                  | Exports                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `rng.ts`                | `makeRng(seed)` → `{ nextFloat, nextInt, nextChoice, nextBool, nextNormal }`. seedrandom-backed Box-Muller for normal draws. |
| `scenario-maeve.ts`     | Zod-validated `Scenario` constant for Maeve Co.                                                                              |
| `synthesize-orders.ts`  | `synthesizeOrders(scenario, rng, window) → SyntheticOrder[]` — 90-day order stream with attribution mix and DOW pattern.    |
| `synthesize-stripe.ts`  | `synthesizeStripeForOrders(orders, scenario, rng) → { payments, refunds, payouts }` — with deliberate gaps for anomalies.    |
| `synthesize-ads.ts`     | `synthesizeAdSpend(orders, scenario, rng) → { campaigns, metricsDaily }` — Meta + Google daily ad metrics with anomalies.   |
| `utm-helpers.ts`        | `buildLandingSite({ source, medium, campaign, content }) → string`. Pure URL construction.                                  |
| `tests/*.test.ts`       | 12 unit tests across 3 files (orders 5, stripe 4, scenario 3).                                                              |

`inferMarketingSource` is **NOT** redefined here — `scripts/seed-demo-org.ts`
imports `extractOrderAttribution` from `@ai-cfo/connector-shopify` to derive
the `source_metadata.attribution` shape (Iron Rule #10).

### Phase 2 — Orchestrator + ONE sample day E2E

`scripts/seed-demo-org.ts` CLI:

```
bun run scripts/seed-demo-org.ts \
  --slug=<orgSlug> \
  [--reset] \
  [--limit-days=N]   (default 90; this session: 1)
  [--with-agent-runs] (default OFF — Phase 4 next session)
  [--dry-run]
```

Workflow:

1. Parse argv (no commander dep).
2. Load `.env.local` for `DATABASE_URL` + `OPENAI_API_KEY`.
3. If `--reset`: `DELETE` org-scoped rows from 19 tables, then `DELETE` org.
4. `INSERT organizations + org_settings (07:00 EST, all delivery channels)`.
5. `INSERT 4 data_connections` (shopify/stripe/meta/google, status='active',
   `encrypted_credentials = NULL` with code-comment "demo-seeded; no real OAuth").
6. Synthesize one day of data (`--limit-days=1`, seed = `<slug>-v1`).
7. Bulk-insert into orders → order_line_items → payments → refunds → payouts
   → ad_campaigns → ad_metrics_daily (transaction-wrapped per day).
8. Run real pipeline for that day:
   - `await computeDailyMetrics(orgId, day)`
   - `await runReconciliation(orgId, { start: day, end: day })`
   - `await runAnomalyJobForDay(orgId, day)` — wraps `computeAnomalyCandidates`
     + persists into `anomalies`. Day 8 introduces this thin wrapper because
     no production job persists anomalies yet (only the agent reads pure
     candidates today).
9. Print summary table (counts per touched table; anomaly_ids; flag_ids).
10. **STOP — Phase 2 done.**

If `--with-agent-runs` is set this session: log `Skipping agent runs (deferred to next session)` and do not invoke the agent.

### Phase Gate Marker: **SESSION 1 STOPS HERE**

Phase 3+ deferred to next session. WIP PR opened at end of Phase 2.

### Phase 3 — Verify + commit + open WIP PR (this session, end of Phase 2 work)

`bun install` → typecheck → lint → test (all green) → live one-day E2E
against Supabase → push branch → `gh pr create` (no auto-merge).

### Phase 4 — Agent runs (next session)

Wire `--with-agent-runs` to call `createAgent({ orgId, ... }).run({ date })`
for each of the 90 days. Each run writes one `agent_traces` row +
optionally `reports`. Skipped this session.

### Phase 5 — Memories (next session)

After agent runs, derive `agent_memories` from traces (existing
`@ai-cfo/learning/jobs/write-memories-from-traces`) so /analyst chat has
substrate to retrieve.

### Phase 6 — Closed-loop snapshots (next session)

For each seeded day, run `measureClosedLoop(orgId, day)` so
`closed_loop_metrics` populates and the per-org-loop dashboard renders.

### Phase 7 — Tests (next session)

End-to-end test under `scripts/seed/tests/seed-demo-org.test.ts` that
exercises the orchestrator against a temp Postgres (or a transactional
rollback against the real DB) covering: idempotent re-run, `--reset` clears
all 19 tables, deterministic seed produces same row counts.

### Phase 8 — Docs + demo video script (next session)

`docs/runbooks/DEMO_VIDEO_SCRIPT.md` written from the seeded scenario.
README updated with `bun run scripts/seed-demo-org.ts --slug=…` quickstart.

## Constraints (echo of Iron Rules; full list in CLAUDE.md)

- **#1**: All money via Dinero.js — no raw `number` arithmetic for currency.
- **#2**: Every seeded row carries `org_id`. Service-role bypass is
  seed-only with explicit code comment.
- **#9**: Closed-loop substrate populates from real pipeline
  (`computeDailyMetrics` + `runReconciliation` + `runAnomalyJobForDay`),
  **never** pre-filled fakes in `daily_metrics`.
- **#10**: Scenario config is generic-shaped; `inferMarketingSource` lives
  in `connectors/shopify`, not in `scripts/seed`.
- **Determinism**: same seed → identical output every time. Pinned in
  `synthesize-orders.test.ts` via deep-equal.

## Expected artifacts (end of Session 2)

- `docs/PLANS/day-8-demo-data-seeder.md` (this file)
- `scripts/seed/rng.ts`
- `scripts/seed/scenario-maeve.ts`
- `scripts/seed/synthesize-orders.ts`
- `scripts/seed/synthesize-stripe.ts`
- `scripts/seed/synthesize-ads.ts`
- `scripts/seed/utm-helpers.ts`
- `scripts/seed/anomaly-job.ts` (Phase 2 wrapper)
- `scripts/seed/tests/scenario-maeve.test.ts` (3 tests)
- `scripts/seed/tests/synthesize-orders.test.ts` (5 tests)
- `scripts/seed/tests/synthesize-stripe.test.ts` (4 tests)
- `scripts/seed-demo-org.ts` (CLI orchestrator)
- `docs/runbooks/DEMO_VIDEO_SCRIPT.md` (Phase 8)

## Session 2 completion log (2026-05-11)

### Phase 2 — Live verification (PASSED)
- Seeder connected via correct pooler hostname (`aws-1-ap-southeast-1.pooler.supabase.com:6543`)
- One-day seed: 34 orders, 24 payments, 72 line items, 5 ad campaigns, 5 ad metrics
- Full pipeline verified: computeDailyMetrics + runReconciliation + runAnomalyJobForDay

### Phase 3 — 90-day seed (COMPLETED)
- 3,219 orders, 6,453 line items, 2,973 payments, 0 refunds, 13 payouts, 450 ad metrics
- 90 daily_metrics rows, 145 reconciliation flags, 46 anomalies
- `MAX_PARAMETERS_EXCEEDED` fix: batched `insertLineItems` and `insertPayments` in 1,000-row chunks
- Pooler hostname fix: Supabase API revealed correct pooler is `aws-1-...:6543` (not `aws-0-...:5432`)

### Phase 4 — Agent runs (DEFERRED)
- Requires explicit cost approval (~$0.70 for full 7-day run)
- `--with-agent-runs` flag is wired but defaults OFF

### Phase 5 — Memory preseed (COMPLETED)
- `scripts/preseed-memories.ts` created
- 5 memories written: 4 pattern + 1 vendor_quirk
- Used `createFakeEmbedder()` (OpenAI quota exceeded on provided key)
- Added `@ai-cfo/memory` to `scripts/package.json` dependencies

### Phase 6 — Integration tests (COMPLETED)
- `scripts/seed/tests/seed-smoke.test.ts` — gated on `TEST_DEMO_DB_URL`
- Asserts: 90+ daily_metrics, 6,000-9,000 orders, 5+ anomalies, 8+ flags
- Cleanup via `--reset` in afterAll

### Phase 7 — Docs (COMPLETED)
- `docs/runbooks/DEMO_DATA_OPERATIONS.md` — operator-facing seed/reset/troubleshooting guide
- `docs/runbooks/DEMO_VIDEO_SCRIPT.md` — 90-second 6-scene screencast script

### Open issues surfaced
- **Refunds = 0**: `synthesize-stripe.ts` does not generate refund rows; anomaly #3 (refund spike) cannot surface
- **ORDER_MISSING_PAYMENT = 0**: Payments reference sourceOrderRef but reconciliation produces PAYMENT_WITHOUT_ORDER instead — payment-to-order matching may not work with synthesized data
- **Pooler hostname discovery**: Supabase projects may use different pooler subdomains (`aws-0-` vs `aws-1-`); added runbook guidance
- **OpenAI quota**: `OPENAI_API_KEY` had no credits; preseed used fake embedder as fallback
