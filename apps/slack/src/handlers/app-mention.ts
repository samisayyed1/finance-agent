import type { App } from "@slack/bolt";
import { logger } from "../logger";

/**
 * `@cfo why did profit drop?` — handles app_mention events.
 *
 * Day-0: ack + placeholder. Real implementation runs the agent against the
 * mention text, posts the answer in-thread, attaches feedback buttons that
 * route to packages/feedback.recordFeedback().
 */
export const registerAppMention = (app: App) => {
  app.event("app_mention", async ({ event, say }) => {
    logger.info({ user: event.user, text: event.text }, "app_mention");
    await say({
      thread_ts: event.ts,
      text: "AI CFO is booting — Day-0 stub. (Will answer with grounded data once Phase 5 lands.)",
    });
  });
};
