# ADR 0003 — Clerk Organizations + Supabase Third-Party Auth

## Status
Accepted — 2026-05-07

## Context
AI CFO is B2B-only. Operators belong to organizations (the brand or the agency); RLS must isolate every byte by organization. We need a B2B-shaped auth provider, an organization-aware JWT, and an integration with Supabase that doesn't require us to mint our own access tokens.

## Decision
Use Clerk Organizations as the identity provider. Configure a JWT template named `supabase` that injects `org_id` (and `role: authenticated`) into every Clerk session token. Enable Clerk's "Supabase" Third-Party Auth integration (officially supported since March 2025) so Supabase accepts the Clerk-minted session directly. Every Postgres RLS policy reads `auth.jwt() ->> 'org_id'` via the `requesting_org_id()` SQL helper.

## Consequences
- Zero custom auth code; Clerk handles MFA, session refresh, password reset, organization invites.
- RLS becomes the single source of authorization truth — code paths cannot accidentally leak across orgs.
- We lose the option to migrate off Clerk without re-minting tokens. We accept that lock-in for the speed.
- B2C is not a path with this setup — disabling personal accounts at the Clerk level enforces this.
- Setup is partially manual (Clerk Dashboard) — captured in `docs/runbooks/CLERK_SUPABASE_SETUP.md`.
