# apps/slack — AI Operating CFO Slack app

Slack Bolt app that surfaces the AI CFO inside the operator's Slack workspace.

## Day-0 status

- `/cfo <question>` slash command stub.
- `app_mention` handler stub (`@cfo …`).
- Block-Kit button handlers for daily-report feedback (👍 / 👎 / 💬), `action_id` pattern `feedback_<signal>_<traceId>`. Day-0 logs only; Phase 5 wires to `packages/feedback.recordFeedback()`.

## Runtime decision (Pre-Decision 2)

Bolt's default HTTP receiver historically has stream-handling issues under Bun. We pin this app to Node 20 via:

- `engines.node >= 20` in `package.json`.
- `start` script uses `node --import tsx` so prod runs on Node.
- `dev` uses `bun --hot` for fast feedback; if Bolt misbehaves under Bun, switch dev to `node --watch` + `tsx`.

Socket Mode is enabled when `SLACK_APP_TOKEN` is present (preferred for local dev so we don't need a public ingress).

## Run

```sh
bun --filter slack dev
# or, if Bun gives Bolt trouble:
node --import tsx apps/slack/src/app.ts
```
