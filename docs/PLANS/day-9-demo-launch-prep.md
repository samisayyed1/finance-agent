# Day 9 — Demo Launch Prep

> Goal of the day: the user records the 90-second loom from
> `docs/runbooks/DEMO_VIDEO_SCRIPT.md` and posts to Twitter + LinkedIn
> (+ optional Show HN). My job is to close every "fingers crossed"
> moment in the script and hand over a paste-ready launch packet.

## Out of scope today

- Recording the loom (human action).
- Posting (human action).
- Day-10 design-partner onboarding (real OAuth, credentials, prod
  Clerk JWTs).
- Multi-currency, MCC Google Ads, SSE streaming for /analyst — all on
  the Day-N+ TODO list and not blocking the demo.

## In scope (four ships)

### Ship 1 — Social copy packet

`docs/runbooks/DEMO_SOCIAL_COPY.md`

- One 3-tweet Twitter/X thread: hook, mechanism, CTA.
- One LinkedIn post (≤ 1,300 chars, paragraph-style).
- One Show HN draft (only if dashboard polish hits the bar; user
  decides at post time).
- Each variant carries a `{{LOOM_URL}}` placeholder so the user
  pastes the URL once and posts.
- A "thread hygiene" checklist at the bottom (when to post, what to
  reply to, what NOT to say).

Cost: ~30 minutes of prose. Risk: zero — pure content.

### Ship 2 — Pre-flight checker

`scripts/demo-preflight.ts`

A single command — `bun run scripts/demo-preflight.ts --slug=demo-shopify-brand` —
that walks the pre-flight checklist from
`DEMO_VIDEO_SCRIPT.md` and prints a green/red checklist. Exits 0 only
if every check passes.

Checks:

1. **Env vars** — `DATABASE_URL`, `ANTHROPIC_API_KEY`, `MCP_SERVER_URL`,
   `MCP_BEARER`, `OPENAI_API_KEY`. Each missing var is reported, never
   crashes.
2. **DB reachable** — `SELECT 1` succeeds.
3. **Demo org exists** — row in `organizations` matching `--slug`.
4. **Seed data present** — for the demo org:
   - ≥ 1 day in `daily_metrics`
   - ≥ 1 `reports` row in the last 7 days
   - ≥ 1 `reconciliation_flags` row open
   - ≥ 1 `anomalies` row in the last 30 days
   - ≥ 1 `agent_traces` row (so `/analyst` has substrate)
   - ≥ 1 `agent_memories` row (so memory retrieval has substrate)
5. **MCP server reachable** — HTTP HEAD or GET `/healthz` (or
   equivalent) returns 200. If the endpoint doesn't exist, we hit the
   MCP root with the configured bearer; 401 means "running but auth
   shape changed", 200 means "ready".
6. **Anthropic key valid** — small completion against haiku to verify
   the key actually authenticates (no full agent run; just a 5-token
   ping).

Output is human-readable; one line per check; final summary "PASS" /
"NEEDS WORK". The checker is idempotent and read-only.

Cost: small. Risk: low — it's an orthogonal script, doesn't touch
hot paths.

### Ship 3 — Interactive citation pills on `/today`

The AI summary card on `/today` today renders the markdown report as
a `<pre>` blob. The demo script Beat 2 explicitly flags this as a
day-9 gap: "Click one to expand the underlying snapshot row in a
side panel (this UI lands by Day 9; if it's not ready by recording,
just hover so the tooltip flashes)."

Ship the hover (tooltip), not the side panel. Scope tight:

- New client component `apps/app/app/(authenticated)/today/components/grounded-summary.tsx`.
- Parse the markdown for `[snapshot:<id>]` / `[anomaly:<id>]` /
  `[flag:<id>]` tokens (same regex Iron Rule #6 enforces in
  `packages/agent/src/grounding/validator.ts`).
- For each match, render the surrounding text as plain prose and the
  citation as a `<button>`-like pill (rounded, monospace, subtle bg)
  that triggers the design-system `Tooltip`/`HoverCard` showing:
  - `snapshot`: snapshot_id + date the row covers
  - `anomaly`: metric + severity + value
  - `flag`: kind + status + delta
- Data: server component fetches the report, harvests every cited id
  from the markdown, single batched lookup against
  `daily_metrics` / `anomalies` / `reconciliation_flags`. Pass the
  resolved map down to the client component.
- Citations whose ids are not found render as plain text (no
  popover), so the page survives stale reports.

Cost: ~150 LOC + 1 unit test for the parser. Risk: medium — we touch
the demo's hero page. Tests + a screenshot before merge.

### Ship 4 — STATUS + plan doc

- Update `docs/STATUS.md`: bump current state to Day 9.
- This plan doc is the source of truth across sessions.

## Iron rule audit (echo from CLAUDE.md)

- **#1**: no math added. Tooltip data is read-only `SELECT` from the
  same tables `/today` already reads.
- **#2**: every new query scoped by `org_id`. Pre-flight does
  `org_id`-scoped queries; tooltip data is scoped by the request's
  `orgId` (from `@ai-cfo/auth`).
- **#6**: the citation parser uses the same regex as
  `validateGrounding`. Citations not in the trace already fail
  rendering upstream; tooltip just surfaces what's already there.
- **#7**: dashboard is the diagnostic layer; the citation UI makes
  the trust story visible, but the product still lives in email/Slack.
- **#9**: no cross-tenant data. Tooltip lookups are RLS-bound by the
  authenticated org.

## Critical files / paths

- `docs/runbooks/DEMO_SOCIAL_COPY.md` (new)
- `scripts/demo-preflight.ts` (new)
- `scripts/seed/tests/demo-preflight.test.ts` (new — pure parser
  paths only, DB-gated suite skipped without DATABASE_URL)
- `apps/app/app/(authenticated)/today/components/grounded-summary.tsx`
  (new — client component)
- `apps/app/app/(authenticated)/today/components/citation-parser.ts`
  (new — pure regex parser; unit-tested)
- `apps/app/app/(authenticated)/today/data.ts` (modify — add
  cited-id lookup helper)
- `apps/app/app/(authenticated)/today/page.tsx` (modify — replace
  `<pre>` with `<GroundedSummary>`)
- `docs/PLANS/day-9-demo-launch-prep.md` (this file)
- `docs/STATUS.md` (modify)

## Verification

1. `bun run typecheck` — 40/40 successful.
2. `bun run lint` — clean.
3. `bun test` for the new parser unit tests passes.
4. `bun run scripts/demo-preflight.ts --slug=demo-shopify-brand` —
   prints a clean PASS table (locally, with the populated env).
5. Manual: `bun --bun dev` in `apps/app`; navigate to `/today` with a
   seeded org; hover over a citation pill; popover renders the
   underlying row.

## Risks

- The design-system Tooltip/HoverCard may not be exported yet under
  `@ai-cfo/design-system/components/ui/*`. If so, fall back to a
  lighter `title=""` HTML attribute and document as a Day-10 polish
  TODO. The recording survives either way.
- `MCP_SERVER_URL`'s `/healthz` may not exist. Pre-flight should
  gracefully degrade to a GET against the root, treating 401 as
  "server is up but bearer is wrong" (still a partial pass) and
  network errors as a hard fail.
- A small Anthropic ping uses ~5 tokens but the user might not want
  to spend any. Make the Anthropic check opt-out via `--no-llm-ping`.
