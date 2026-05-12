# Production Deployment Runbook — Day 10

> Goal: take the monorepo from local-only to live on Vercel + Trigger.dev
> with all four apps reachable at HTTPS URLs and the cron jobs firing on
> their real schedules.
>
> Audience: Sami, doing this once.

## Topology

```
Vercel       ← apps/app, apps/api, apps/web, apps/mcp (4 projects)
Trigger.dev  ← packages/jobs, packages/learning (one project)
Supabase     ← Postgres + pgvector + Clerk Third-Party Auth
Cloudflare   ← R2 bucket for raw payloads (Iron Rule #4)
Hookdeck     ← webhook routing → apps/api
Clerk        ← auth + org switcher
Resend       ← email delivery
Anthropic    ← Claude API
OpenAI       ← text-embedding-3-small for agent_memories
```

**Slack (`apps/slack`) is intentionally deferred** — Bolt's HTTP receiver
doesn't fit Vercel serverless (Bolt expects to own the server lifecycle,
or to run Socket Mode persistently). Ship it to Railway / Fly later;
~$5/mo for a persistent container. Email + dashboard delivery already
work without Slack.

## Phase 1 — External services (one-time, ~45 min)

These are vendor dashboards. No CLI. Don't proceed until each step
returns a credential you can paste into Vercel later.

### 1.1 Supabase production project

1. https://supabase.com/dashboard → New project. Region: pick closest to
   your operator base (probably us-east-1 or eu-west-2).
2. Run all migrations from `supabase/migrations/` against the prod DB:
   ```bash
   supabase link --project-ref <prod-ref>
   supabase db push
   ```
3. Grab from Project Settings → API:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Project Settings → Database → Connection string (URI). Grab the
   pooler URL — that's your `DATABASE_URL`. Do NOT use the direct URL
   from a serverless function; you'll exhaust connections.

### 1.2 Clerk production instance

1. https://dashboard.clerk.com → Create Application → name it `AI CFO`.
2. **Enable Organizations** in Configure → Organizations.
3. Configure → API Keys: grab `CLERK_PUBLISHABLE_KEY` +
   `CLERK_SECRET_KEY`.
4. Configure → JWT Templates → New → select **Supabase**. Set claim:
   ```json
   { "org_id": "{{org.id}}" }
   ```
   Save. This is the JWT template name `CLERK_JWT_TEMPLATE=supabase`.
5. In Supabase dashboard → Authentication → Third-party Auth → Add
   provider → Clerk. Paste the Clerk JWKS URL.
6. Allowed origins / redirects — paste the Vercel preview + production
   URLs you'll get in Phase 2. (Come back to this after Phase 2.4.)

Detailed walk-through: `docs/runbooks/CLERK_SUPABASE_SETUP.md`.

### 1.3 Cloudflare R2

1. https://dash.cloudflare.com → R2 → Create bucket. Name:
   `ai-cfo-raw-payloads-prod`.
2. Manage R2 API Tokens → Create token → scope: this bucket, read+write.
3. Grab `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET`.

### 1.4 Hookdeck

1. https://dashboard.hookdeck.com → New connection.
2. Source: pick the service (Shopify / Stripe). Destination: the Vercel
   API URL (Phase 2.4 output, e.g. `https://api-aicfo.vercel.app/webhooks/<source>`).
3. Save the signing secret → `HOOKDECK_SIGNING_SECRET`.
4. Grab `HOOKDECK_API_KEY` from Settings → API.

### 1.5 Resend

1. https://resend.com/domains → Verify your sending domain (e.g.
   `tenetlabs.uk`). DNS records may already be added per STATUS.md;
   click "Verify" once propagated.
2. Grab `RESEND_API_KEY` from API Keys.
3. Pick a `RESEND_FROM` address like `daily@tenetlabs.uk`.

### 1.6 OpenAI

Grab `OPENAI_API_KEY` from https://platform.openai.com/api-keys. This
is only for embeddings (text-embedding-3-small for agent_memories).
Day-1 spend is < $1.

### 1.7 Connector OAuth credentials (calendar-blocked, do in parallel)

These take 1–7 business days each. Submit applications NOW.

- **Shopify**: https://partners.shopify.com → Apps → Create app →
  custom. Grab `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET`.
- **Stripe Connect**: https://dashboard.stripe.com/settings/connect →
  Get your Connect platform live access. Grab `STRIPE_CLIENT_ID` +
  `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
- **Meta**: https://developers.facebook.com → My Apps → Create app
  (Business type). Apply for **Marketing API advanced access**. Grab
  `META_APP_ID` + `META_APP_SECRET`. Approval: weeks.
- **Google Ads**: https://developers.google.com/google-ads/api/docs/oauth/cloud-project
  + Google Cloud Console OAuth Client ID. Apply for a **Developer Token**
  at https://ads.google.com/aw/apicenter. Approval: 1–3 business days.
  Grab `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`,
  `GOOGLE_ADS_CLIENT_SECRET`.

### 1.8 Trigger.dev login

```bash
# One-time, opens browser. Project ID already in trigger.config.ts.
npx trigger.dev@latest login

# Verify:
npx trigger.dev@latest whoami
# Expect: account email + default profile
```

If you don't see the project `proj_twtvmmscloonroehkmqm` after login,
the Trigger.dev dashboard membership for that project doesn't include
this account. Switch accounts or invite this account to the project.

## Phase 2 — Vercel deployments (~30 min)

Each app gets its own Vercel project. Run from inside the app's
directory.

### 2.1 apps/app (the dashboard)

```bash
cd apps/app
vercel link
# Pick scope: your team. Pick project name: ai-cfo-app (or similar).
# When asked "Link to existing project?": No.
# Detected framework: Next.js — confirm.
vercel env pull .env.local  # pulls any existing vars (likely empty)
```

Open https://vercel.com/<scope>/<project>/settings/environment-variables
and paste the **app** column from the env matrix below. Then:

```bash
vercel --prod
```

Output: a production URL like `https://ai-cfo-app.vercel.app`. Save it
as `NEXT_PUBLIC_APP_URL`.

### 2.2 apps/api (webhooks + OAuth callbacks)

```bash
cd ../api
vercel link    # project name: ai-cfo-api
```

Paste the **api** column from the env matrix. Deploy:

```bash
vercel --prod
```

URL → `NEXT_PUBLIC_API_URL`.

### 2.3 apps/web (marketing site)

```bash
cd ../web
vercel link    # project name: ai-cfo-web
```

Paste the **web** column. Deploy:

```bash
vercel --prod
```

URL → `NEXT_PUBLIC_WEB_URL`. Optionally attach the apex domain
(tenetlabs.uk) here.

### 2.4 apps/mcp (the MCP server)

The MCP server is a Hono app deployed as a Vercel serverless function
via `apps/mcp/api/index.ts` (Day-10 wiring). Its `vercel.json` rewrites
all paths to that function.

```bash
cd ../mcp
vercel link    # project name: ai-cfo-mcp
```

Paste the **mcp** column. Deploy:

```bash
vercel --prod
```

URL → `MCP_SERVER_URL`. Format: `https://ai-cfo-mcp.vercel.app/mcp`.

### 2.5 Re-deploy the dashboard with the actual URLs filled in

After Phase 2.4 you know all four URLs. Go back to apps/app's env vars,
paste the real `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WEB_URL` /
`MCP_SERVER_URL`, then redeploy:

```bash
cd ../app && vercel --prod
```

### 2.6 Wire Clerk redirects

In Clerk dashboard → Allowed origins, add:
- `https://ai-cfo-app.vercel.app`
- `https://ai-cfo-web.vercel.app`
- (if custom domain) `https://app.tenetlabs.uk`, `https://tenetlabs.uk`

Clerk → Paths: confirm sign-in / sign-up redirect URLs are set.

## Phase 3 — Trigger.dev deploy (~5 min)

```bash
# From repo root
npx trigger.dev@latest deploy
```

This packages every task in `packages/jobs/src` and `packages/learning/src`
(per `trigger.config.ts`) and uploads to Trigger.dev Cloud. Watch the
output for any task that fails to bundle (usually a missing env or a
native dep we forgot to mark external).

In the Trigger.dev dashboard → Environment Variables, paste the
**trigger** column from the env matrix below. Trigger.dev's runtime
will use these when running tasks.

Schedules are pulled from `schedules.task({ cron: "..." })` decorators
in the task source — no separate cron config needed.

## Phase 4 — Hookdeck → Vercel webhook routing

In each connector's vendor dashboard, point webhook destinations at
the **Hookdeck** URL, not directly at Vercel. Hookdeck retries +
buffers + replays.

- Shopify webhooks → `<hookdeck-source-url-shopify>` → forwards to
  `${NEXT_PUBLIC_API_URL}/webhooks/shopify`
- Stripe webhooks → `<hookdeck-source-url-stripe>` → forwards to
  `${NEXT_PUBLIC_API_URL}/webhooks/payments`
- Resend webhooks → `<hookdeck-source-url-resend>` → forwards to
  `${NEXT_PUBLIC_API_URL}/webhooks/resend`

## Phase 5 — Smoke test (~10 min)

1. **Marketing site loads**: `https://ai-cfo-web.vercel.app` → hero
   renders, "Sign in" CTA points at the dashboard.
2. **Dashboard sign-up**: visit `https://ai-cfo-app.vercel.app/sign-up`,
   create an account through Clerk, create your first organization.
3. **Empty state on `/today`**: renders the Connect-your-data card.
4. **Demo data smoke**: from a local terminal with
   `DATABASE_URL` set to the prod connection string, run
   ```bash
   bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --reset --limit-days=7
   ```
   Switch to that org in the dashboard. `/today` should render real
   numbers; `/settings/reconciliation` should show flags.
5. **Pre-flight**: `bun run scripts/demo-preflight.ts --slug=demo-shopify-brand`
   against the prod URLs. Expect all-green.
6. **First daily report**: in Trigger.dev dashboard, manually trigger
   `ai-cfo.daily-report-for-org` with `{ orgId, date }`. Check the
   email lands.

## Phase 6 — DNS / custom domains (optional, do later)

When you're ready to swap `vercel.app` URLs for branded ones:

- `app.tenetlabs.uk` → apps/app
- `api.tenetlabs.uk` → apps/api
- `mcp.tenetlabs.uk` → apps/mcp
- `tenetlabs.uk` (apex) → apps/web

Add the domain to each Vercel project → Vercel auto-issues TLS. Update
the `NEXT_PUBLIC_*_URL` env vars to the new domains. Re-deploy.

---

## Env-var matrix

Columns are which Vercel project (or Trigger.dev) needs the var.
Server-only vars (no `NEXT_PUBLIC_` prefix) are bound to **Production +
Preview + Development** unless noted.

| Variable | app | api | web | mcp | trigger | Source |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ |   | ✓ | ✓ | Supabase |
| `SUPABASE_URL` | ✓ | ✓ |   | ✓ | ✓ | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` |   | ✓ |   | ✓ |   | Supabase |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ |   |   |   |   | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ |   |   |   |   | Supabase |
| `CLERK_SECRET_KEY` | ✓ | ✓ |   |   |   | Clerk |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✓ | ✓ | ✓ |   |   | Clerk |
| `CLERK_WEBHOOK_SECRET` |   | ✓ |   |   |   | Clerk |
| `CLERK_JWT_TEMPLATE` | ✓ |   |   |   |   | `supabase` |
| `R2_ACCOUNT_ID` |   | ✓ |   |   | ✓ | Cloudflare |
| `R2_ACCESS_KEY_ID` |   | ✓ |   |   | ✓ | Cloudflare |
| `R2_SECRET_ACCESS_KEY` |   | ✓ |   |   | ✓ | Cloudflare |
| `R2_BUCKET` |   | ✓ |   |   | ✓ | Cloudflare |
| `HOOKDECK_API_KEY` |   | ✓ |   |   |   | Hookdeck |
| `HOOKDECK_SIGNING_SECRET` |   | ✓ |   |   |   | Hookdeck |
| `SHOPIFY_API_KEY` |   | ✓ |   |   | ✓ | Shopify |
| `SHOPIFY_API_SECRET` |   | ✓ |   |   | ✓ | Shopify |
| `SHOPIFY_REDIRECT_URI` |   | ✓ |   |   |   | `${NEXT_PUBLIC_API_URL}/oauth/shopify/callback` |
| `STRIPE_SECRET_KEY` |   | ✓ |   |   | ✓ | Stripe |
| `STRIPE_CLIENT_ID` |   | ✓ |   |   |   | Stripe Connect |
| `STRIPE_WEBHOOK_SECRET` |   | ✓ |   |   |   | Stripe |
| `STRIPE_REDIRECT_URI` |   | ✓ |   |   |   | `${NEXT_PUBLIC_API_URL}/oauth/stripe/callback` |
| `META_APP_ID` |   | ✓ |   |   | ✓ | Meta |
| `META_APP_SECRET` |   | ✓ |   |   | ✓ | Meta |
| `META_OAUTH_STATE_SECRET` |   | ✓ |   |   |   | random 32-byte hex |
| `GOOGLE_ADS_DEVELOPER_TOKEN` |   | ✓ |   |   | ✓ | Google |
| `GOOGLE_ADS_CLIENT_ID` |   | ✓ |   |   | ✓ | Google |
| `GOOGLE_ADS_CLIENT_SECRET` |   | ✓ |   |   | ✓ | Google |
| `GOOGLE_OAUTH_STATE_SECRET` |   | ✓ |   |   |   | random 32-byte hex |
| `ANTHROPIC_API_KEY` |   |   |   | ✓ | ✓ | Anthropic |
| `ANTHROPIC_AGENT_MODEL` |   |   |   | ✓ | ✓ | `claude-opus-4-7` |
| `ANTHROPIC_CLASSIFIER_MODEL` |   |   |   | ✓ | ✓ | `claude-haiku-4-5-20251001` |
| `OPENAI_API_KEY` |   |   |   |   | ✓ | OpenAI (embeddings) |
| `MCP_SERVER_URL` | ✓ |   |   |   | ✓ | Phase 2.4 output, `https://ai-cfo-mcp.vercel.app/mcp` |
| `MCP_BEARER` | ✓ |   |   |   | ✓ | Clerk JWT in prod; `dev:<orgId>` only in non-prod |
| `RESEND_API_KEY` |   | ✓ |   |   | ✓ | Resend |
| `RESEND_FROM` |   | ✓ |   |   | ✓ | e.g. `daily@tenetlabs.uk` |
| `DATA_CONNECTION_ENCRYPTION_KEY` |   | ✓ |   |   | ✓ | random 32-byte hex (AES-256-GCM) |
| `NEXT_PUBLIC_APP_URL` | ✓ | ✓ | ✓ |   |   | Phase 2.1 output |
| `NEXT_PUBLIC_API_URL` | ✓ | ✓ | ✓ |   |   | Phase 2.2 output |
| `NEXT_PUBLIC_WEB_URL` | ✓ | ✓ | ✓ |   |   | Phase 2.3 output |
| `NEXT_PUBLIC_DOCS_URL` | ✓ |   | ✓ |   |   | placeholder URL (no docs site yet) |
| `DAILY_REPORT_EMAIL_TO` |   |   |   |   | ✓ | per-org override; Day-1 hardcode your own email |
| `FLAGS_SECRET` | ✓ | ✓ | ✓ |   |   | random 32-byte hex |
| `ARCJET_KEY` | ✓ | ✓ | ✓ |   |   | Arcjet (next-forge default; optional) |
| `BETTERSTACK_API_KEY` | ✓ | ✓ | ✓ | ✓ | ✓ | Optional uptime monitoring |
| `BETTERSTACK_URL` | ✓ | ✓ | ✓ | ✓ | ✓ | Optional uptime monitoring |
| `SENTRY_ORG` | ✓ | ✓ | ✓ |   |   | Optional error tracking |
| `SENTRY_PROJECT` | ✓ | ✓ | ✓ |   |   | Optional error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | ✓ | ✓ | ✓ |   |   | Optional |
| `NEXT_PUBLIC_POSTHOG_KEY` | ✓ |   | ✓ |   |   | Optional analytics |
| `NEXT_PUBLIC_POSTHOG_HOST` | ✓ |   | ✓ |   |   | Optional analytics |
| `LOG_LEVEL` | ✓ | ✓ | ✓ | ✓ | ✓ | `info` |

### Optional / future
- `LIVEBLOCKS_SECRET` — collaboration features not wired yet.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob; we use R2 instead.
- `UPSTASH_REDIS_REST_*` — rate limiting; ship later.
- `BASEHUB_TOKEN` — CMS; not used by AI-CFO content yet.
- `SVIX_TOKEN` — webhook fan-out; not in use.
- `SLACK_*` — Slack ingress, defer to Railway deploy.

### Generating randoms

For every `random 32-byte hex` field:

```bash
openssl rand -hex 32
```

Use a different value per field. Don't reuse `FLAGS_SECRET` for
`DATA_CONNECTION_ENCRYPTION_KEY`.

---

## Failure recovery

Most likely things to break and how to diagnose:

- **`vercel --prod` fails on build with "Invalid environment variables"** —
  one of the @t3-oss/env-nextjs `keys()` schemas is rejecting a missing
  var. The error tells you which one. Set it, redeploy.
- **`vercel --prod` succeeds but route returns 500** — check
  `vercel logs <project>`. Usually a runtime env miss (server reads a
  var that build didn't validate).
- **OAuth redirect mismatch** — the redirect URI in the connector's
  vendor dashboard must EXACTLY match `*_REDIRECT_URI` env. Copy-paste,
  don't retype.
- **Hookdeck destination timing out** — the Hookdeck "connection" UI
  shows the last 50 invocations + their downstream HTTP status.
- **Trigger.dev deploy succeeds, tasks don't fire** — check Trigger.dev
  dashboard → Schedules tab. Each cron-decorated task should appear.
  If not, the bundler may have stripped the schedule decorator.
- **First agent run says "MCP_SERVER_URL and MCP_BEARER must be set"** —
  the bearer logic in `apps/mcp/src/middleware.ts` rejects `dev:<orgId>`
  bearers in production (NODE_ENV=production). You need to either (a)
  ship the Clerk-JWT-minting bearer path or (b) accept that prod runs
  only work after that lands.

## What's NOT deployed by this runbook

- `apps/slack` → Railway / Fly, separate ~30-minute setup.
- DSPy + GEPA Python sidecar → Day 30+ per ADR-0013.
- Eval-driven prompt evolution → still placeholder echo provider.
- Real connector OAuth (Meta, Google) → calendar-blocked on vendor
  approval.
- Billing → Stripe Subscriptions not wired.
- Legal docs → DPA, ToS, Privacy — Phase 6 of Finish Line 2.
