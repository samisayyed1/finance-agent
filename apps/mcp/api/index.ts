/**
 * Vercel serverless entry-point for the AI CFO MCP server.
 *
 * Vercel's Node.js runtime understands a default-exported Web Fetch
 * handler (`Request` → `Response`). Hono apps expose exactly that shape
 * via `app.fetch`. Module load is side-effect-free — observability init
 * runs lazily inside `app.ts` when imported.
 *
 * The local-dev path uses `src/server.ts` instead; both share `src/app.ts`.
 */

import { app } from "../src/app";

export const config = {
  runtime: "nodejs",
};

// Vercel routes every incoming request under this app to `app.fetch`.
// MCP's Streamable HTTP transport uses single POST→JSON-RPC responses
// rather than long-lived SSE, so the standard 60s serverless timeout
// is comfortably above the per-tool response budget.
export default app.fetch;
