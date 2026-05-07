import { App } from "@slack/bolt";
import { registerAppMention } from "./handlers/app-mention";
import { registerCfoCommand } from "./handlers/cfo-command";
import { registerFeedbackButtons } from "./handlers/feedback-buttons";
import { logger } from "./logger";

/**
 * AI CFO Slack app.
 *
 * Pre-Decision 2: Slack Bolt under Bun has historically had stream issues
 * with the default HTTP receiver. We pin runtime to Node 20 via
 * `package.json` engines + tsx, falling back to socket-mode in dev. If the
 * default receiver misbehaves, swap to `ExpressReceiver` and front it with
 * an HTTP terminator outside Bolt.
 */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: Boolean(process.env.SLACK_APP_TOKEN),
  appToken: process.env.SLACK_APP_TOKEN,
  port: Number(process.env.PORT ?? 4001),
});

registerCfoCommand(app);
registerAppMention(app);
registerFeedbackButtons(app);

await app.start();
logger.info({ port: process.env.PORT ?? 4001 }, "ai-cfo-slack started");

export default app;
