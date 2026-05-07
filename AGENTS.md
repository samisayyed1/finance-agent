# Agent rules for AI Operating CFO

This file applies to ANY autonomous coding agent working on this repo (Codex, DeepSeek, Cursor, etc.). The senior agent (Claude Code) owns correctness-critical code per CLAUDE.md.

## What you may touch
- `packages/connectors/*` (one source per worktree thread)
- `packages/db/factories/*` (test fixtures)
- `apps/app/(dashboard)/*` (UI from existing design system + Tremor)
- `apps/slack/handlers/*` (after the agent skeleton lands)
- `docs/*` (technical docs and runbooks)
- `.github/*` (CI tweaks, dependabot, codeowners)

## What you must NOT touch
- `packages/metrics/*`, `packages/reconcile/*`
- `packages/agent/*`, `packages/memory/*`, `packages/feedback/*`, `packages/learning/*`, `packages/evals/*`
- `apps/mcp/*`
- Any Drizzle schema file or migration
- Any RLS policy, any prompt, any grounding validator

## Standards
- Plan first. Share the plan in the PR description.
- TDD: write failing tests, then implement until green.
- Never push to main; open PR to a `claude/*` or `codex/*` branch.
- If a test fails after your changes, STOP and report — do not invent fixes.
- Every connector implements `Connector<RawEvent, Normalized>` from `@ai-cfo/shared`.
- All money via Dinero.js. No raw number arithmetic for currency.
- Conventional commits. No force-push.
- The five iron rules from CLAUDE.md apply to you too.

## Architectural principles you must respect
1. AI-native, not AI-bolted (removal test must pass).
2. Deterministic truth + AI on top (LLM never computes numbers).
3. Product lives in operator's surfaces (push, not pull).
4. Closed self-improving loop per-org with strict RLS isolation (THE moat).
5. Universal-extensible (ecommerce wedge, generic architecture).
