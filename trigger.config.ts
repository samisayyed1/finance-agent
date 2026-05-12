import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev v3 configuration. The `project` id is provided by the user
 * (Day 10 deploy). Tasks live in the workspace packages — `dirs` points
 * Trigger.dev at every directory that exports `schedules.task` /
 * `schemaTask` / `tasks.trigger` so the CLI's deploy step packages them
 * into a single uploaded bundle.
 *
 * Login + project access:
 *   - `npx trigger.dev@latest login` (one-time, opens browser)
 *   - `npx trigger.dev@latest deploy` (push tasks to Trigger.dev Cloud)
 *   - `npx trigger.dev@latest dev` (local-dev runtime that streams runs
 *     into the Trigger.dev dashboard)
 *
 * Logging: Trigger.dev's own logger is used inside tasks. Pino is for
 * Bun-runtime modules; do not mix the two inside a Trigger.dev task body.
 */
export default defineConfig({
  project: "proj_twtvmmscloonroehkmqm",
  runtime: "node",
  logLevel: "info",
  maxDuration: 600, // 10-minute task budget — generous for backfills.
  dirs: ["./packages/jobs/src", "./packages/learning/src"],
  build: {
    // Keep the bundle lean: server-side native deps must be excluded so
    // Trigger.dev's bundler doesn't try to ship them.
    external: ["postgres", "@aws-sdk/client-s3"],
  },
});
