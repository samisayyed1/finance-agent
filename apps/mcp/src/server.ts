import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { buildMcpServer, handleMcpRequest } from "./hono-bridge";
import { logger } from "./logger";
import { type McpEnv, requireBearer } from "./middleware";
import { oauthRouter } from "./oauth";
import { initObservability } from "./observability";

initObservability();

const app = new Hono<McpEnv>();
const mcpServer = buildMcpServer();

app.get("/", (c) => c.json({ ok: true, service: "ai-cfo-mcp" }));
app.route("/", oauthRouter);

app.use("/mcp/*", requireBearer);
app.all("/mcp", (c) => handleMcpRequest(c, mcpServer));

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
logger.info({ port }, "ai-cfo-mcp listening");

export default app;
