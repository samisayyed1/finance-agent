# Project Status — AI Operating CFO

> Read this file FIRST in every new session. It supplements CLAUDE.md, AGENTS.md, docs/SPEC.md, docs/adr/, and docs/PLANS/.

## Current state (last updated: 2026-05-12)
- **Day shipped**: Day 8 Session 1 (demo seeder Phase 0+1+2) — merged to main as 0d0f459
- **Day in flight**: PR #10 (Day 8 Session 2) → PR #11 (Day 9 demo launch prep) → PR #12 (Day 9 Tier 1 polish) stacked.
- **Day in progress**: Day 9 — Tier 1 polish (brand wordmark, page-title template, AI-CFO marketing hero, headline snapshot pill).
- **Cumulative real tests**: ~210+ passing
- **Pages live**: /today, /metrics, /analyst, /exports, /settings/{connections,reconciliation,team}
- **Connectors live**: Shopify (full), Stripe (full), Meta (fixture-tested, awaits creds), Google (fixture-tested, awaits creds), Slack (OAuth shipped)
- **Closed loop**: pgvector memory + 4 Trigger.dev learning jobs, agent_traces written on every run
- **Demo data**: `bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --reset --limit-days=90 [--with-agent-runs]` populates 90-day Maeve Co. dataset incl. 6 baked anomalies, optional agent traces, memories, and per-day closed-loop snapshots. See docs/runbooks/DEMO_VIDEO_SCRIPT.md.

## Strategic decisions (chronological, post-Day-0)
- **Day 0**: Pivoted from midday-ai/v1 (repurposed to packrun) → vercel/next-forge (MIT, Bun+Turbo+Next15) + Phase 2.5 Prisma→Drizzle swap. ADR-0002.
- **Day 0**: Knock notifications package removed (upstream SDK drift, never used). ADR-0015.
- **Day 0**: Zep+Graphiti memory deferred — native Postgres+pgvector chosen Day 4. ADR-0012 superseded.
- **Day 4**: Ship native Postgres pgvector for memory; Zep reconsider at Day 8+ when entity-relation reasoning becomes bottleneck.
- **Day 8**: PHASED execution. Session 1 = Phase 0+1+2 only (synthesis modules + one-day E2E). Session 2 = Phase 4-8 (90-day expansion + agent runs + memories + closed-loop + e2e tests + docs). Phase 3 was the WIP-PR/verify gate at end of Session 1 (PR #8).

## Non-negotiable iron rails (full versions: CLAUDE.md, AGENTS.md)
1. AI never computes a number — Dinero.js + tested SQL only
2. Every table has org_id + RLS reading auth.jwt() ->> 'org_id'
3. Webhooks idempotent by event_id; reconciliation jobs alongside
4. Raw payloads in R2, immutable
5. Every PR runs lint + typecheck + test:metrics + test:reconcile + test:rls + test:eval
6. Agent never produces a number not from tool call; grounding validator rejects
7. Product lives in operator's surfaces (email/Slack/WhatsApp); dashboard is diagnostic
8. MVP recommends, never executes
9. Closed self-improving loop per-org IS the moat — RLS isolated, no cross-tenant pooling
10. Universal-extensible — connectors generic, no ecommerce-specific code in metrics/reconcile/agent

## Skip stack (pending non-engineering work)
- [x] GitHub Actions Approve — clicked
- [ ] Resend domain verification for tenetlabs.uk — DNS records added at Netlify, awaiting verification (use onboarding@resend.dev as fallback)
- [ ] Meta App ID/Secret — Sami creating account; will land before live design partner
- [ ] Google Ads Client ID/Secret + Developer Token — pending; dev token approval 1-3 business days
- [ ] Slack Client ID/Secret/Signing Secret — pending; manifest at docs/runbooks/SLACK_APP_SETUP.md
- [ ] Stripe Connect platform Client ID — pending

## What's next
- **Day 9 (this PR)**: Interactive citation pills on `/today` (Iron Rule #6 surface), `scripts/demo-preflight.ts` checker, paste-ready social copy in `docs/runbooks/DEMO_SOCIAL_COPY.md`. Stacked on the Day 8 Session 2 branch.
- **Day 9 (human)**: Record 90-second demo via `DEMO_VIDEO_SCRIPT.md`. Run `bun run scripts/demo-preflight.ts --slug=demo-shopify-brand` first; only press record on PASS. Post Twitter + LinkedIn using `DEMO_SOCIAL_COPY.md`.
- **Day 10**: First design partner onboarding. Wire credentials, real OAuth flow.

## Known limitations / Day-N+ TODOs
- Chat returns JSON not SSE (Day 7 limitation, ~30 LOC fix)
- Multi-currency days collapse to dominant currency
- Google Ads MCC support — login_customer_id picker
- Meta long-lived token refresh path (60-day expiry detection shipped, refresh flow not yet)
- DSPy + GEPA Python sidecar for prompt evolution — Day 30+

## Test count by package (Day 7 end)
agent 22, metrics 32, connector-shopify 38, connector-stripe 13, connector-meta 9, connector-google 19, reconcile 18, anomaly 15, jobs 6+, memory 5+4 DB-gated, learning 5, mcp 6, evals 4, shared 2

## Test count by package (Day 8 Session 2 end)
scripts 19 passing + 1 DB-gated e2e skipped without DATABASE_URL (parse-args 7, scenario-maeve 3, synthesize-orders 5, synthesize-stripe 4; seed-demo-org e2e gated). All other packages unchanged from Day 7.

## Test count by package (Day 9 end)
scripts 23 (preflight-args 4 added). apps/app 12 (citation-parser 10 added). Everything else unchanged. Tier 1 polish ship was zero net tests (UI presentation only; the SnapshotPill / headline-card pill exercise the same parser + lookup path the citation-pills already cover).

Update this file at the end of every shipped day.
