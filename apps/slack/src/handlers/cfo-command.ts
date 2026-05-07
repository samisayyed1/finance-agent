import type { App } from "@slack/bolt";
import { logger } from "../logger";

/**
 * `/cfo <question>` — opens an analyst chat with the AI CFO in any channel.
 *
 * Day-0: ack + post a placeholder. Real implementation hands the question to
 * packages/agent (Claude Agent SDK with MCP toolbelt) and streams the
 * grounded answer back, attaching a `trace_id` to every Slack message so
 * `/feedback` interactions write into agent_feedback under the right trace.
 */
export const registerCfoCommand = (app: App) => {
  app.command("/cfo", async ({ ack, command, respond }) => {
    await ack();
    logger.info({ user: command.user_id, text: command.text }, "/cfo invoked");
    await respond({
      response_type: "ephemeral",
      text: `AI CFO is booting — Day-0 stub. You asked: \`${command.text}\``,
    });
  });
};
