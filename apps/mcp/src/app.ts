/**
 * The Hono application — module-load side-effect-free. Both the local
 * dev entry-point (`src/server.ts`) and the Vercel serverless entry-point
 * (`api/index.ts`) import this and wire it to a transport-appropriate
 * adapter.
 *
 * Splitting `app.ts` out of `server.ts` keeps the Bun `serve()` listener
 * isolated to the local-dev path. Importing `server.ts` from Vercel would
 * try to bind a port, which serverless functions cannot do.
 */

import { Hono } from "hono";
import { handleMcpRequest } from "./hono-bridge";
import { type McpEnv, requireBearer } from "./middleware";
import { oauthRouter } from "./oauth";
import { initObservability } from "./observability";

initObservability();

export const app = new Hono<McpEnv>();

app.get("/", (c) => c.json({ ok: true, service: "ai-cfo-mcp" }));
app.route("/", oauthRouter);

app.use("/mcp/*", requireBearer);
app.all("/mcp", (c) => handleMcpRequest(c, { orgId: c.get("orgId") }));
