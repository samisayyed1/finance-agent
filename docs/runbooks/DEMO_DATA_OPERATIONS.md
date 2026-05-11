# Demo Data Operations

How to seed, reset, and manage the Maeve Co. demo dataset.

## Quickstart

```bash
# Full 90-day seed (default)
bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --reset

# Dry run (see projected counts, no DB writes)
bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --dry-run

# Limit to N days
bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --limit-days=7
```

**Expected duration**: 3–8 minutes for a full 90-day seed depending on machine and connection.

## CLI flags

| Flag | Effect |
|------|--------|
| `--slug=<slug>` | Organization slug (default: `demo-shopify-brand`) |
| `--reset` | DELETE all org-scoped rows before inserting (cascading clean) |
| `--limit-days=N` | Only synthesize N days from today backward (default: 90) |
| `--dry-run` | Synthesize and print projected counts, skip all DB writes |
| `--with-agent-runs` | Run the daily-report agent for each seeded day (deferred — requires Anthropic credits) |

## Reset semantics

`--reset` deletes FROM (most-dependent-first order):
1. `flag_status_history`
2. `reconciliation_flags`
3. `anomalies`
4. `daily_metrics`
5. `closed_loop_metrics`
6. `ad_metrics_daily`
7. `order_line_items`
8. `refunds`
9. `payouts`
10. `payments`
11. `orders`
12. `ad_campaigns`
13. `agent_traces`
14. `agent_memories`
15. `agent_feedback`
16. `agent_outcomes`
17. `reports`
18. `connection_alerts`
19. `sync_runs`
20. `raw_payloads`
21. `data_connections`
22. `org_settings`
23. `organizations`

Re-running without `--reset` is idempotent: all INSERTs use `ON CONFLICT DO NOTHING`.

## What gets seeded

| Table | ~Count (90 days) | Notes |
|-------|-----------------|-------|
| `organizations` | 1 | Maeve Co. |
| `org_settings` | 1 | 07:00 EST, all delivery channels |
| `data_connections` | 4 | Shopify, Stripe, Meta, Google (status=active, no real OAuth) |
| `orders` | 3,000–3,500 | DOW-weighted revenue pattern |
| `order_line_items` | 6,000–7,000 | 2–3 line items per order |
| `payments` | 2,800–3,200 | ~8 per day missing for deliberate drift |
| `refunds` | 0–5 | Currently no refund synthesis (Day 8 limitation) |
| `payouts` | 12–14 | One every ~7 days |
| `ad_campaigns` | 5 | 3 Meta, 2 Google |
| `ad_metrics_daily` | 450 | 5 sources × 90 days |
| `daily_metrics` | 90 | Computed by pipeline |
| `reconciliation_flags` | 100–150 | Mostly PAYMENT_WITHOUT_ORDER |
| `anomalies` | 40–50 | Revenue, ROAS, CAC, AOV surges |
| `agent_memories` | 5 | Baseline patterns (pre-seeded) |

## The 6 planted anomalies

| # | Day window | Description | Expected signal |
|---|-----------|-------------|----------------|
| 1 | -80 to -75 | Meta attribution drift (30% iOS gap) | ATTRIBUTION_MISMATCH flags |
| 2 | -62 to -55 | Meta broad-audience ROAS collapse (4.1→1.8) | roas-anomaly, high severity |
| 3 | -47 to -45 | Refund spike (6× normal, defective batch) | refund_rate anomaly (requires refund synthesis — currently 0) |
| 4 | -30 | Organic new-customer surge (PR mention) | new_customers spike |
| 5 | -14 | Stripe payout gap (3 business-day delay) | PAYOUT_GAP flag |
| 6 | -7 to 0 | 8 orders missing Stripe charges (~$1,847) | ORDER_MISSING_PAYMENT flags |

**Note**: Anomalies #3, #5, and #6 rely on refund/payout/missing-payment synthesis that may not fully surface with the current synthesis modules. The ROAS and revenue anomalies (#1, #2) surface most reliably.

## Cost estimate

- **Seed itself**: ~$0 (synthesis is pure computation, no LLM calls)
- **Memory preseed**: ~$0 (uses fake/deterministic embedder if OpenAI key unavailable)
- **Agent runs (deferred)**: ~$0.10/day ≈ $9 for full 90-day reseed at current Anthropic pricing
- **Total (demo day)**: ~$0 for seed + memories; ~$9 if you also run the agent

## Troubleshooting

**"Tenant or user not found"**: Your DATABASE_URL is using the wrong pooler subdomain. Check Supabase Dashboard → Settings → Database → Connection pooling for the correct pooler hostname. Some projects use `aws-0-`, others use `aws-1-`.

**"MAX_PARAMETERS_EXCEEDED"**: The batch insert is too large. This is handled by chunking in the seeder (1000 rows per batch). If it still occurs, reduce the `CHUNK` constant.

**"No anomalies surfaced"**: The 1-day seed won't produce anomalies (no history for z-score calculation). Use at least 30 days.
