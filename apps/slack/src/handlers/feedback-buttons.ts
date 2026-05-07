import { database, sql } from "@ai-cfo/database";
import { recordFeedback } from "@ai-cfo/feedback";
import type { App } from "@slack/bolt";
import { logger } from "../logger";

/**
 * Block Kit button handlers for daily-report feedback (👍 / 👎 / 💬).
 *
 * Block buttons embed `action_id = feedback_<signal>_<traceId>` so we don't
 * need a separate state store. The handler:
 *   1. Parses signal + traceId from action_id.
 *   2. Resolves orgId from data_connections by team_id (Slack team installs
 *      one app per workspace; we store team_id in source_metadata).
 *   3. Calls recordFeedback().
 *   4. Posts an ephemeral confirmation to the clicker.
 */
const FEEDBACK_ACTION_RE =
  /^feedback_(?<signal>positive|negative|correction)_(?<traceId>.+)$/;

const resolveOrgIdFromTeamId = async (
  teamId: string
): Promise<string | null> => {
  const result = await database.execute<{ org_id: string }>(
    sql`select org_id::text as org_id
        from public.data_connections
        where source = 'slack'
          and source_metadata ->> 'team_id' = ${teamId}
        limit 1`
  );
  const rows = result as unknown as { org_id: string }[];
  return rows[0]?.org_id ?? null;
};

export const registerFeedbackButtons = (app: App) => {
  app.action(FEEDBACK_ACTION_RE, async ({ ack, action, body, respond }) => {
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
    const signal = match.groups.signal as
      | "positive"
      | "negative"
      | "correction";
    const traceId = match.groups.traceId;

    // Resolve orgId from the Slack team that delivered the message.
    const teamId =
      ("team" in body && typeof body.team === "object" && body.team
        ? (body.team as { id?: string }).id
        : undefined) ?? undefined;

    const orgId = teamId ? await resolveOrgIdFromTeamId(teamId) : null;
    if (!orgId) {
      logger.warn(
        { teamId, signal, traceId },
        "feedback: no org for Slack team"
      );
      await respond({
        response_type: "ephemeral",
        text: "Couldn't record feedback — your workspace isn't linked. Ping support.",
      });
      return;
    }

    try {
      await recordFeedback({
        orgId,
        traceId,
        signal,
        channel: "slack",
        operatorUserId: body.user.id,
      });
    } catch (err) {
      logger.error(
        { err, orgId, traceId, signal },
        "feedback: recordFeedback failed"
      );
      await respond({
        response_type: "ephemeral",
        text: "Sorry — couldn't record that just now. Try again in a sec.",
      });
      return;
    }

    const messages: Record<typeof signal, string> = {
      positive: "Thanks — recorded.",
      negative: "Got it. Marked off-base.",
      correction:
        "Noted — leave a quick note in this channel and the agent will learn from it.",
    };
    const message = messages[signal];
    await respond({ response_type: "ephemeral", text: message });
  });
};
