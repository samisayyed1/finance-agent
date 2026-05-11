# Demo Video Script — Day 9 Recording

> Goal: a 90-second loom that takes a cold prospect from "what is this?" to
> "I want this for my brand." Voice-over + screen capture only. No editing
> wizardry required — every shot below is captured live against the seeded
> Maeve Co. dataset.

## Pre-flight (do this once, the morning of recording)

1. `.env.local` populated with: `DATABASE_URL`, `ANTHROPIC_API_KEY`,
   `MCP_SERVER_URL=http://localhost:3010/mcp`, `MCP_BEARER=dev:<orgId-from-seed>`,
   `OPENAI_API_KEY`. (Resend / Slack creds optional — delivery is OFF in the
   demo to avoid Slack spam in front of camera.)
2. Reset and reseed the demo org with all 90 days, all agent runs, all
   memories, and all closed-loop snapshots:
   ```bash
   # Terminal A — boot the MCP server (the agent talks to this)
   cd apps/mcp && bun run dev   # listens on :3010

   # Terminal B — boot the dashboard (you'll click through this on camera)
   cd apps/app && bun run dev   # opens at :3000

   # Terminal C — reseed
   bun run scripts/seed-demo-org.ts \
     --slug=demo-shopify-brand \
     --reset \
     --limit-days=90 \
     --with-agent-runs
   ```
   The seed prints a JSON summary at the bottom — copy it somewhere; the
   `orgId` is what you'll use to scope dashboard URLs if Clerk is bypassed.
3. Confirm the dashboard renders. The six baked-in anomalies should all be
   visible on `/today` and `/settings/reconciliation`. If `/today` is empty,
   `--reset` failed mid-flight; rerun.
4. Quiet the laptop: close every browser tab except the dashboard. Mute
   Slack. Plug into AC. Set Loom to 4K, screen-only, audio-on.

## Shot list (90 seconds, six beats)

### Beat 1 — The hook (0:00 → 0:10)

**Voice-over**:
> "Most ecommerce founders find out their numbers are wrong by accident —
> a refund spike that ran for three days before anyone noticed, a Meta
> conversion count that's been over-reporting for a month, a Stripe payout
> that arrived late. The AI Operating CFO catches all of that the morning
> after it happens."

**Screen**: hard cut to the `/today` dashboard. The grounded summary at
the top is *the* hero shot. Don't scroll yet.

### Beat 2 — Today's report (0:10 → 0:25)

**Voice-over**:
> "This is yesterday's report, generated at 7 AM in the operator's
> timezone. Every number you see — revenue, ROAS, refund rate — was
> computed by deterministic SQL, not by the model. The model wrote the
> narrative; the renderer rejected it if any number wasn't tied back to a
> tool call. That's the grounding rule."

**Screen**: scroll the report. Hover the inline citations — show the
`[snapshot:...]` tokens. Click one to expand the underlying snapshot row
in a side panel (this UI lands by Day 9; if it's not ready by recording,
just hover so the tooltip flashes).

### Beat 3 — The anomalies (0:25 → 0:40)

**Voice-over**:
> "Six of these are deliberate — Meta over-reporting conversions by 30
> percent for a week, eight orders missing their Stripe charges, a refund
> spike from a defective batch. The system flagged each one the day it
> started, with a specific dollar impact and a recommendation. Human
> approves; nothing runs without a click."

**Screen**: click into `/settings/reconciliation`. Show the open
`ATTRIBUTION_MISMATCH` flags from the day-80 window, then the
`ORDER_MISSING_PAYMENT` flags from the last 7 days. Show the bulk-resolve
button — don't click it (we keep the demo dataset intact).

### Beat 4 — Where it lives (0:40 → 0:55)

**Voice-over**:
> "And here's the trick — the operator never has to come here. The same
> report ships to Slack, to email, to WhatsApp. The dashboard is the
> diagnostic layer; the product lives where the operator already is."

**Screen**: split-screen mock or cut to a screenshot of a Slack DM
preview showing the same daily report rendered as Block Kit. (If a real
Slack workspace is available, send a test message before recording and
show the mobile thumbnail.)

### Beat 5 — The closed loop (0:55 → 1:15)

**Voice-over**:
> "Every interaction trains the system *for this brand only*. The
> operator thumbs-up a recommendation; the system remembers. They
> override a threshold; next month's report respects it. Grounding rate,
> feature recall, outcome accuracy — all tracked per-org, all isolated
> by row-level security, no cross-tenant pooling. Ever."

**Screen**: navigate to the analyst chat. Type:
> "What were our biggest refund days in the last 30 days?"

Show the response streaming with citations to the seeded refund-spike
window (days -47 to -45). The traces and memories from the seed run mean
this chat lands with substrate, not cold-start.

### Beat 6 — The close (1:15 → 1:30)

**Voice-over**:
> "Shopify, Stripe, Meta, Google today — QuickBooks, Xero, Plaid next.
> The architecture's universal. If you're running a brand between
> $50k and $2M a month, the wait list is open. Link below."

**Screen**: cut to the landing page or a contact form. End on the
product wordmark + a single CTA button.

## After recording

- Export at 1080p (4K is overkill for Twitter/LinkedIn embeds).
- Trim to ≤90s. If you went long, the Slack/WhatsApp beat is the first
  to cut.
- Post in this order:
  1. Twitter — pinned, with the loom embed and a one-line hook.
  2. LinkedIn — same loom, longer caption tying back to the founder's
     prior product or audience.
  3. Show HN — only if the dashboard's polished enough to survive a
     close look. Skip for v1.

## Failure recovery

If the agent transport fails mid-recording (Anthropic 429, MCP server
crash), the dashboard pages still render — they read directly from
Postgres. The only thing you lose is the live chat beat (Beat 5). Have a
pre-recorded chat clip as backup, or skip Beat 5 and extend Beat 4.
