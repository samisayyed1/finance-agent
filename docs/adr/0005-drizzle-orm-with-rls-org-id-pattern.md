# ADR 0005 — Drizzle ORM with RLS-by-org_id pattern

## Status
Accepted — 2026-05-07

## Context
Iron Rule #1 says the AI never computes a number; the deterministic truth layer does. That means hand-written, reviewable, cent-exact SQL inside `packages/metrics` and `packages/reconcile`. Iron Rule #2 says every table has `org_id` and an RLS policy. Whatever ORM we pick must support raw SQL at the boundary, RLS-aware migrations, and exact type inference for Drizzle-style query builders.

## Decision
Adopt Drizzle ORM. Schema files under `packages/database/src/schema/`. Migrations are split: app-schema migrations via `drizzle-kit`, and policy/extension/closed-loop migrations as raw `.sql` files under `supabase/migrations/`. Both apply via `supabase db push`. Re-export Drizzle's `eq, and, sql, ...` helpers from `@ai-cfo/database` so consumers don't take a separate dep on `drizzle-orm`.

## Consequences
- `packages/metrics` can drop into raw SQL via `database.execute(sql\`...\`)` without fighting an ORM.
- Type inference is end-to-end: `typeof pages.$inferSelect` is the source of truth for `Page`.
- We hand-author RLS policies in raw SQL — that's where the security boundary lives.
- We replace the next-forge default (Prisma) — see ADR 0002 for the migration cost.
- Drizzle's smaller surface area makes it easier for engineers without ORM-fluency to read query code six months from now.
