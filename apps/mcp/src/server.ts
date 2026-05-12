/**
 * Local-dev entry-point. Bun runs this directly via `bun --hot run ./src/server.ts`
 * (see `package.json#scripts.dev`). Listens on `process.env.PORT ?? 4000`.
 *
 * The Vercel serverless deployment uses `api/index.ts` instead — that path
 * imports the same `app` and exports `app.fetch` so Vercel's Node runtime
 * can hand it requests directly.
 *
 * NOTE: do NOT add `export default app;` here. Bun auto-serves any
 * default-exported Hono-shaped object on `process.env.PORT`, which
 * conflicts with the explicit @hono/node-server listen below (EADDRINUSE).
 * The bare `serve()` call is the authoritative listener for local dev.
 */

import { serve } from "@hono/node-server";
import { app } from "./app";
import { logger } from "./logger";

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
logger.info({ port }, "ai-cfo-mcp listening");
