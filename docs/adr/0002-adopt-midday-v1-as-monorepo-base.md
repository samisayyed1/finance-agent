# ADR 0002 — Adopt vercel/next-forge as monorepo base; swap Prisma → Drizzle in Phase 2.5

## Status
Accepted — 2026-05-07

## Context
The originally considered base (midday-ai/v1) was repurposed by its maintainers into packrun.dev (an npm package comparison product) before Day 0 — verified during Phase 1 license/structure audit by reading its current package.json. We needed a different MIT-licensed monorepo base with Bun + Turbo + Next.js 15 + Clerk + Resend + React-Email already wired, to save ~150-300 hours of foundation plumbing.

## Decision
Adopt vercel/next-forge v6.0.2 (MIT, Vercel-maintained, 367 releases through March 2026) as the monorepo base. Swap its default Prisma ORM to Drizzle in Phase 2.5 to satisfy Iron Rule #1 (raw-SQL access required for cent-exact metrics and reconciliation correctness paths).

## Consequences
- Save ~150-300 hours of foundation plumbing (Clerk, Resend, React-Email, Stripe, Sentry, Arcjet, PostHog, Svix, cron, storage, i18n already wired).
- One-time cost: ~half-day Prisma→Drizzle conversion in packages/database.
- Vercel-blessed stack signals competence to enterprise buyers and investors.
- Future framework upgrades require tracking next-forge release notes; accepted overhead in exchange for the head start.
- Drizzle gives us raw-SQL discipline at the metrics/reconcile boundary, which Prisma's query builder discourages.
