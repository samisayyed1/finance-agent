# ADR 0015 — Remove the Knock notifications package inherited from next-forge

## Status
Accepted — 2026-05-07

## Context
next-forge v6.0.2 ships `@repo/notifications` (renamed to `@ai-cfo/notifications`) — a wrapper around `@knocklabs/node` for in-app notification trays. The Knock SDK constructor signature changed upstream (`new Knock(apiKey: string)` → `new Knock(opts: ClientOptions)`), and next-forge's wrapper has not been updated. This caused `bun run typecheck` to fail at baseline. AI Operating CFO does not need in-app notification trays — the product lives in the operator's existing surfaces (email, Slack, WhatsApp), not in our web dashboard's chrome.

## Decision
Delete `packages/notifications` entirely along with its four callsites in `apps/app` (sidebar `<NotificationsTrigger>`, the `notifications-provider.tsx` wrapper, the `<NotificationsProvider>` mount in `(authenticated)/layout.tsx`, and the `notifications/keys` import in `env.ts`). AI CFO delivery happens via `packages/delivery`: email through Resend, Slack through Bolt, WhatsApp through Twilio.

## Consequences
- One fewer dependency to maintain; one less SDK whose drift can break our CI.
- Iron Rule #5 (typecheck must gate every PR) preserved without patching upstream code we will never wire up.
- If we ever want in-app notifications (e.g., a "1 new anomaly" badge inside the diagnostic dashboard), we add them deliberately rather than inheriting them.
- Two adjacent upstream-drift cleanups taken in the same pass (documented here for completeness, not promoted to their own ADRs because they are smaller-blast-radius dead-code removals): `packages/payments/ai.ts` (Stripe agent toolkit, zero consumers, broken against `@stripe/agent-toolkit` 0.9 signature change), `packages/ai` entire package (Vercel `ai` SDK wrapper, zero consumers, broken against `ai` 6.x type renames; we use Claude Agent SDK instead), plus storybook-only `chart.tsx`/`resizable.tsx` and the `apps/storybook` showcase app (recharts/react-resizable-panels signature drift, no production callers).
- Net Day-0 baseline shape: 20 typecheck-clean workspace tasks, 221 files lint-clean.
