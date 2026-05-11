# Demo Launch Social Copy

> Paste-ready posts for the Day-9 launch. Every draft has a
> `{{LOOM_URL}}` placeholder — find/replace once with the recorded
> loom URL before posting. Pick **one** Twitter variant + one LinkedIn
> variant. Show-HN is optional and gated on the dashboard's polish at
> recording time.

## How to use this doc

1. Record the loom per `DEMO_VIDEO_SCRIPT.md`.
2. Paste the loom URL into `{{LOOM_URL}}` in the variant you're using.
3. Post Twitter first (it's the lowest-friction surface). Wait 30
   minutes to see if the hook lands; if traction is dead, the
   LinkedIn post still works cold.
4. LinkedIn second (auto-cross-posts to your audience).
5. Show HN only if you're feeling brave **and** every dashboard page
   renders without a "TODO" or empty state.

---

## Twitter / X — three-tweet thread

### Variant A (recommended — the mechanism hook)

**Tweet 1 / hook**

> Most ecommerce founders find out their numbers are wrong by accident.
>
> A refund spike that ran for 3 days. A Meta conversion count
> over-reporting for a month. A Stripe payout that arrived late.
>
> Built an AI Operating CFO that catches all of it the morning after.
>
> 90 seconds, sound on ↓
>
> {{LOOM_URL}}

**Tweet 2 / mechanism**

> Two rules made it work:
>
> 1) The AI never computes a number. Every metric is cent-exact SQL.
> 2) The agent can't ship a number without citing the database row it
>    came from. Citations are validated at render time. Ungrounded
>    output gets rejected.
>
> The model writes the narrative. The numbers come from somewhere
> auditable.

**Tweet 3 / CTA**

> Lives in your inbox + Slack, not a dashboard. The dashboard is the
> diagnostic layer, not the product.
>
> Shopify + Stripe + Meta + Google today. QuickBooks/Xero/Plaid next.
>
> Looking for design partners running $50k–$2M/mo. DM open.

### Variant B (founder POV — slightly softer hook)

**Tweet 1**

> Spent the last 9 days building an AI CFO that I'd trust with my own
> brand's numbers.
>
> The rule I refused to break: the model never computes a number. Every
> claim has to cite the database row it came from, or the renderer
> drops it.
>
> Here's the 90-second walkthrough.
>
> {{LOOM_URL}}

**Tweet 2**

> Six anomalies are baked into the demo dataset on purpose — Meta
> over-reporting conversions, 8 orders missing their Stripe charges, a
> refund spike from a defective batch. The system flagged each one with
> a dollar impact and a human-approves-first recommendation.
>
> No auto-actions. Ever (for now).

**Tweet 3**

> If you run an ecommerce brand between $50k and $2M/mo and you've ever
> said "I think our numbers are off but I don't know where" — DM open.
> First 5 design partners get founding pricing locked in for 12 months.

---

## LinkedIn — single post (≤ 1,300 chars)

> Most ecommerce founders find out their numbers are wrong by accident.
> A refund spike that ran for 3 days. A Meta conversion count
> over-reporting for a month. A Stripe payout that arrived late.
>
> I built an AI Operating CFO that catches all of it the morning after.
> 90 seconds, sound on:
>
> {{LOOM_URL}}
>
> Two non-negotiable rules made it work:
>
> 1. The AI never computes a number. Every metric is cent-exact SQL,
>    unit-tested against the actual platform fees. Dinero.js, not raw
>    floats.
> 2. The agent can't ship a number without citing the database row it
>    came from. Citations are validated at render time. If a token
>    fails grounding, the entire report is rejected.
>
> The model writes the narrative. The numbers come from somewhere
> auditable.
>
> The product lives in the operator's inbox + Slack. The dashboard is
> the diagnostic layer, not the product itself.
>
> Shopify + Stripe + Meta + Google today. QuickBooks / Xero / Plaid
> next quarter. The architecture is universal — ecommerce is the
> wedge, not the ceiling.
>
> If you run a brand between $50k and $2M per month, looking for design
> partners. DM open.

---

## Show HN (optional)

**Title** (max 80 chars):

> Show HN: AI CFO that can't ship a number without citing the database row

**URL**: `{{LOOM_URL}}` (or your landing page)

**Comment** (first reply you self-post to seed context):

> I've been frustrated by every "AI for finance" demo where the model
> just hallucinates a plausible-looking number. So I built one where
> that's structurally impossible.
>
> Two rules:
>
> 1. The AI never computes a number. All metrics live in a `metrics`
>    package with cent-exact Dinero.js + unit tests against actual
>    Stripe / Shopify fee schedules. The model only narrates.
> 2. Every numeric token in agent output has to carry an inline
>    citation `[snapshot:<id>]` / `[anomaly:<id>]` / `[flag:<id>]`. A
>    grounding validator parses the output and rejects any ungrounded
>    response at the renderer boundary. The model literally cannot
>    ship a number it didn't get from a tool call.
>
> Closed self-improving loop per-org: every operator interaction
> (feedback, override, outcome) becomes labeled training data scoped
> by `org_id` with RLS isolation. Cross-tenant data pooling is
> forbidden by construction — privacy, competitive harm, legal
> liability.
>
> Stack: TypeScript monorepo (Bun + Turbo), Hono, Next.js 15, Drizzle
> on Supabase Postgres + RLS, Trigger.dev v3, Claude Agent SDK + own
> MCP server, native pgvector for memory, Promptfoo for evals.
>
> The 90-second loom shows the dashboard side; the product is meant to
> live in email + Slack. Demo data is deterministic — anyone with the
> repo can `bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand
> --reset` and get the same 90-day Maeve Co. dataset (a fake DTC home
> goods brand) with the same six baked-in anomalies.
>
> Happy to answer questions about the grounding validator, the closed
> loop, or the deterministic-truth-layer architecture.

---

## Thread hygiene checklist

Before you hit "post":

- [ ] The loom plays clean from the link, no auth wall.
- [ ] Loom thumbnail shows the `/today` hero shot, not a Twitter logo.
- [ ] Loom title: "AI Operating CFO — 90s walkthrough" (or similar).
- [ ] You're posting from the founder account, not the project
      account. Personal voice converts harder than brand voice on the
      first launch.
- [ ] Phone notifications off so you can stay present in the replies
      for the first 30 minutes.

After posting:

- Reply to every comment within the first 60 minutes. The Twitter
  algo rewards comment density in the early window.
- DON'T quote-tweet hostility. If someone says "this is just a Zapier
  wrapper", reply once with the grounding-validator point and move
  on. No long arguments.
- If a thread is hitting, pin it. If it's flat by 4h, take the L and
  ship Day-10.

## Variants reference

Tweet variant A is the recommended default — leads with the
operator's pain ("numbers wrong by accident"), then explains the
mechanism. Variant B is softer and may resonate better with a
founder-heavy audience that already knows the pain.

Pick by **who you think will RT first**:

- If your highest-RT-likelihood follower is an operator → Variant A.
- If they're another founder → Variant B.
