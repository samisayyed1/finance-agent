# Day 9 — Tier 1 Polish

> Goal: make the demo recording visibly tighter without spending design
> budget. Stacked on top of `claude/day9-demo-launch-prep` (PR #11).

## Out of scope (deliberately)

- Visual identity / brand book / illustrations.
- Touching the dashboard color palette. The current neutral-with-amber/red-alert
  story is tasteful B2B SaaS; changing it for the sake of changing it
  risks making it worse, not better.
- Internationalization. `apps/web` uses a dictionary system; for demo
  recording the English landing page is the only thing that has to look
  right. Other locales keep next-forge defaults.
- Real email-capture infra (Resend, Supabase table, double opt-in,
  unsubscribe). A `mailto:` link is the right amount of effort for
  the design-partner waitlist stage.

## In scope (four small ships)

### Ship 1 — Brand wordmark in the app sidebar

The sidebar header currently goes straight to Clerk's
`OrganizationSwitcher`. There is no product wordmark anywhere — a
fresh viewer can't tell what they're looking at.

Add an `AppBrand` component that renders **"AI · CFO"** in a small-caps
wordmark, placed above the `OrganizationSwitcher` in `SidebarHeader`.
Collapses gracefully when the sidebar collapses to icon mode.

### Ship 2 — Page-title template (favicon deferred)

- Set `metadata.title.template` on the dashboard root layout so every
  page reads `<Page> — AI Operating CFO` in the browser tab and Loom
  recording.
- Drop redundant " — AI CFO" suffixes from per-page metadata so the
  template can do its job (e.g. `/today`'s title becomes just "Today").

**Favicon deferred to Tier 2 designer work.** The existing 32×32 PNG
glyph (next-forge default) isn't embarrassingly bad and isn't on the
critical path for the demo. Swapping it requires generating a tasteful
icon — a designer's call, not mine.

### Ship 3 — Marketing site hero + waitlist mailto

`apps/web/app/[locale]/(home)/page.tsx` currently renders SEVEN
next-forge default sections (Hero, Cases, Features, Stats,
Testimonials, FAQ, CTA). Every one of those is placeholder content
about a generic SaaS — wrong for AI-CFO and embarrassing to point a
prospect at.

Approach:
- Replace `Hero` content with AI-CFO copy (the same hook as
  `DEMO_SOCIAL_COPY.md`). Hardcoded English — no dictionary surgery.
- Hide all other home sections by removing them from `page.tsx`.
  Leave the components untouched; they're next-forge defaults that
  may come back when we hire a designer.
- The hero "Sign up" CTA continues to deep-link into the dashboard
  (Clerk handles the rest).
- Replace the "Get in touch" button with a `mailto:` link to the
  founder's email with a pre-filled subject line — zero-infrastructure
  design-partner waitlist.

### Ship 4 — Polish raw text on /today headline

The `HeadlineCard` on `/today` renders the snapshot id as a raw
`snapshot:xxx` mono line below the headline. Day 9 shipped citation
pills inside the AI summary; this surface is still bare.

Wrap the snapshot id in the same `HoverCard` pattern so hovering the
small `snap` pill on the headline card shows the underlying row.
Reuses the `SnapshotCard` body from `grounded-summary.tsx` — refactor
that snippet into a shared component so both surfaces consume it.

### Ship 5 — STATUS + plan doc update

This file. Bump STATUS.

## Cost

~3–4 hours, single PR. Reviewable diff: <500 LOC additions.

## Iron rule audit

- **#1** (no math): unchanged.
- **#2** (org_id + RLS): no new queries.
- **#6** (grounding): the headline-card hover reuses the SAME data
  fetcher (`fetchCitationLookup`) the AI summary card uses, so we're
  surfacing existing grounded rows, never inventing.
- **#7** (operator's surfaces): the marketing site customization is
  an entry-point to the operator's product, not a replacement for the
  operator's surfaces. Consistent.
- **#9** (no cross-tenant): no new data flows.

## Verification

1. `bun run typecheck` 40/40.
2. `bun run lint` clean.
3. `cd apps/app && bun run test` still 12/12.
4. Visual: `bun --bun dev` in `apps/app`, navigate to `/` — sidebar
   header shows "AI · CFO" wordmark above the org switcher; favicon
   shows the new glyph in the browser tab; headline card snapshot id
   is now a hover-card pill.
5. Visual: `bun --bun dev` in `apps/web`, navigate to `/` — hero
   renders AI-CFO copy; "Join waitlist" opens email composer; other
   home sections are gone.

## Risks

- **mailto link UX**: some users have webmail as default rather than
  a desktop client; the mailto opens a hidden Gmail compose. Accept
  this. The friction is fine for a design-partner-only stage; if it
  becomes a problem we wire Resend or Typeform.
- **Hidden home sections**: removing Cases/Features/Stats/etc. without
  replacing them with AI-CFO equivalents means the home page is just
  a hero. That's fine for a 1-week-old product but feels thin. We'll
  flesh it out when the first 3 design partners have given feedback
  on which features deserve top-of-funnel air time.
- **Dashboard accent color stays neutral**: some viewers may read
  "not a real brand" from the lack of a primary color. Counter-signal
  is the wordmark, the citation pills, and the grounding story. If
  the demo lands and a designer comes onboard, this is the first
  thing they'll do.
