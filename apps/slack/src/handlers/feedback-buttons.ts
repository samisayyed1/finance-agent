import type { App } from "@slack/bolt";
import { logger } from "../logger";

/**
 * Block Kit button handlers for daily-report feedback (👍 / 👎 / 💬 "tell me why").
 *
 * Day-0: ack + log; real implementation calls
 * `packages/feedback.recordFeedback({ orgId, traceId, signal, channel: 'slack' })`.
 *
 * Block buttons in daily reports must include `action_id` of the form
 * `feedback_<signal>_<traceId>` so we can extract the trace_id without a
 * separate state store.
 */
const FEEDBACK_ACTION_RE =
  /^feedback_(?<signal>positive|negative|correction)_(?<traceId>.+)$/;

export const registerFeedbackButtons = (app: App) => {
  app.action(FEEDBACK_ACTION_RE, async ({ ack, action, body }) => {
    await ack();
    const actionId =
      "action_id" in action && typeof action.action_id === "string"
        ? action.action_id
        : null;
    if (!actionId) {
      return;
    }
    const match = FEEDBACK_ACTION_RE.exec(actionId);
    if (!match?.groups) {
      return;
    }
    const { signal, traceId } = match.groups;
    logger.info(
      { user: body.user.id, signal, traceId },
      "feedback button clicked"
    );
    // TODO Phase 5: import { recordFeedback } from "@ai-cfo/feedback";
    // await recordFeedback({ orgId: ?, traceId, signal, channel: "slack", operatorUserId: body.user.id });
  });
};
