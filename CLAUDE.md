# Project: AI Operating CFO

## Stack
TypeScript monorepo (Bun + Turbo), Hono API, Next.js 15, Drizzle on Supabase Postgres + RLS, Clerk Organizations via Supabase Third-Party Auth, Trigger.dev v3, Cloudflare R2, Hookdeck, Claude Agent SDK + our own MCP server, Zep + Graphiti for temporal memory, Slack Bolt + Resend + Twilio for delivery, Tremor + TanStack Table for the diagnostic dashboard, Promptfoo + DSPy/GEPA (Day 30+) for the per-org closed-loop.

## Iron rules (NON-NEGOTIABLE)
1. The AI never computes a number. All metrics live in `packages/metrics` with cent-exact unit tests using Dinero.js. Reconciliation lives in `packages/reconcile`.
2. Every table has `org_id` and an RLS policy reading `(auth.jwt() ->> 'org_id')`. Migrations must include the policy.
3. Webhooks idempotent by `event_id`. Reconciliation jobs alongside webhooks (Shopify webhook delivery is not guaranteed).
4. Raw API payloads stored in R2, IMMUTABLE. Normalized data is always rebuildable from raw.
5. Every PR runs: bun lint, bun typecheck, bun test, bun test:metrics, bun test:reconcile, bun test:rls, bun test:eval. All must pass.
6. The agent NEVER produces a number that didn't come from a tool call. Every claim cites snapshot_id, anomaly_id, or flag_id. Grounding validator rejects ungrounded outputs at the renderer boundary.
7. **The product lives in the operator's existing surfaces** — email, Slack, WhatsApp. The web dashboard is the diagnostic/admin/trust layer. Architectural decisions must serve push-not-pull delivery.
8. For MVP the agent recommends, never executes. No automated budget changes. No automated customer emails. Human-in-the-loop on every irreversible action.
9. **Closed self-improving loop per-org IS the moat.** Every operator interaction is captured as labeled training data scoped by org_id with RLS isolation. Memory, feedback, outcomes, eval set, threshold tuning, prompt evolution are first-class concerns. Cross-tenant data pooling is FORBIDDEN — privacy, competitive harm, legal liability. Per-org grounding rate, feature recall, and outcome accuracy must trend up over each customer's tenure; if flat after 60 days, the loop is broken — alert.
10. **Universal-extensible architecture.** Ecommerce is the wedge ($50k-$2M/mo Shopify+Stripe+Meta+Google brands and the agencies serving them). The endgame is universal AI CFO. Connectors implement a generic interface; schema is not ecommerce-specific. QuickBooks/Xero/NetSuite/Plaid plug in later without restructuring. No ecommerce-specific assumptions in `packages/metrics`, `packages/reconcile`, `packages/agent`.

## Conventions
- Drizzle for app code; raw SQL only inside `packages/metrics` and `packages/reconcile` (reviewed line-by-line).
- Zod schema for every API and tool boundary; types derived from Zod.
- Errors are typed `Result<T, E>` at module boundaries.
- pino for logging — no `console.log` in shipped code.
- No `any`. No `as` casts without a comment justifying.
- All money via Dinero.js. Never raw `number` for monetary values.
- All time via date-fns / date-fns-tz. Never raw `Date` math for DoW comparisons.

## Workflow
- Plan first (`docs/PLANS/<task>.md`). Implement after approval.
- Branch per feature: `claude/<area>-<short>` or `codex/<area>-<short>`. Conventional commits.
- I (the senior agent — Claude Code or equivalent) own correctness-critical code: schema, RLS, metrics, reconcile, agent, MCP, memory, feedback, learning, evals. Other agents (Codex, etc.) must NOT touch these.
