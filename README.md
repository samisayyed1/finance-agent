# AI Operating CFO

The world's first AI-native operating CFO. Lives in your email, Slack, and WhatsApp. Fetches real-time data from Shopify, Stripe, Meta, and Google. Reconciles to the cent. Tells you what changed and what to do today — every word grounded in a citable database row.

See docs/SPEC.md for the product playbook. UNLICENSED — proprietary.

## Demo data

Populate a single org with 90 days of deterministic synthetic data (orders,
payments, refunds, payouts, ad spend, six baked-in anomalies) and run the
production pipeline against it:

```bash
bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --reset --limit-days=90
```

Add `--with-agent-runs` to additionally invoke the daily-report agent for
each seeded day, distill memories from the resulting traces, and write per-day
closed-loop snapshots. Requires `apps/mcp` running locally
(`bun --bun dev` in `apps/mcp`) and `MCP_SERVER_URL`, `ANTHROPIC_API_KEY` in
the environment. Full demo-video flow: `docs/runbooks/DEMO_VIDEO_SCRIPT.md`.

