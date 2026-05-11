# Demo Video Script — AI Operating CFO (90 seconds)

> Recorded against the Maeve Co. demo dataset. Recommended: Cleanshot or Loom, 1080p, system audio only.

## Scene 1: Landing (0:00–0:12)

**Visual**: Dashboard `/today` — Sunday May 11, 2026 snapshot.

**Narration**: "This is the AI Operating CFO. Every morning, before you open Shopify, it's already looked at yesterday's numbers. Revenue: $X. 46 anomalies flagged this quarter. 145 reconciliation issues tracked."

**Key elements to show**:
- Headline metric card (revenue + delta)
- 3-card grid (orders, ROAS, refund rate)
- Flags + anomalies count
- Sync health (4 green dots for Shopify, Stripe, Meta, Google)

## Scene 2: Metrics (0:12–0:27)

**Visual**: Dashboard `/metrics` — 90-day curves.

**Narration**: "Ninety days of data. Revenue curve. ROAS and MER. Orders and new customers. Every number is a database row — the AI didn't make any of this up."

**Key elements to show**:
- Revenue chart (show Tuesday/Thursday peaks)
- ROAS chart (point out the spike on April 11 — that's the ROAS anomaly)
- Orders chart (weekday pattern visible)
- Switch between 7/30/90 day views

## Scene 3: Analyst Chat (0:27–0:45)

**Visual**: Dashboard `/analyst` — chat interface.

**Narration**: "Ask it anything. 'What happened with ROAS last week?' It pulls the numbers from the database, cites every claim to a specific snapshot or anomaly ID. Not a single hallucinated number."

**Key elements to show**:
- Type a question: "Why did ROAS spike on April 11?"
- Show the response with inline citations `[snapshot:...]`
- Show the agent citing specific anomaly_ids

## Scene 4: Reconciliation (0:45–1:00)

**Visual**: Dashboard `/settings/reconciliation` — flag list.

**Narration**: "145 things don't add up. 144 payments without matching orders. Attribution drift between Meta's numbers and what actually landed in Shopify. Every one tracked, severity-classified, with a breadcrumb trail back to the source."

**Key elements to show**:
- Flag list with severity badges
- Show ATTRIBUTION_MISMATCH flag
- Show bulk-resolve UI (select multiple, mark as acknowledged)

## Scene 5: The Moat (1:00–1:15)

**Visual**: Show the closed-loop metrics (if available) or the memory preseed.

**Narration**: "This is the moat. Every operator interaction — a 👍 here, a correction there — becomes training data. Six months in, this agent knows your brand's vendors, seasonality, and cash-flow rhythm better than a new fractional CFO would after a year."

**Key elements to show**:
- Agent traces count
- Memory store (5 baseline patterns seeded)
- Closed-loop metrics dashboard (if wired)

## Scene 6: Where it lives (1:15–1:30)

**Visual**: Mock Slack message + email + WhatsApp screenshot (can be static images).

**Narration**: "It meets you where you are. Morning report in email. Midday flag in Slack. Anomaly alert on WhatsApp. You don't log into a dashboard — the CFO comes to you."

**Key elements to show**:
- Slack message format (DailyReport as rich blocks)
- Email preview (Resend template)
- WhatsApp notification mockup

## Recording Checklist

- [ ] 1080p resolution
- [ ] System audio only (no mic unless doing live voiceover)
- [ ] Hide bookmarks bar, clean desktop
- [ ] Dark mode dashboard
- [ ] Pre-seed the dataset (90 days) the night before
- [ ] Open 4 tabs ahead of time: Today, Metrics, Analyst, Reconciliation
- [ ] Dry-run the chat question to confirm the agent responds with citations

## Post-Recording

- Trim to exactly 90 seconds
- Add a closing slide with: "AI Operating CFO — early access at [URL]"
- Post to Twitter/LinkedIn with the hook: "I built an AI CFO that lives in your email, Slack, and WhatsApp. Here's what 7 days of shipping looks like."
