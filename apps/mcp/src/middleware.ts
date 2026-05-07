import { createMiddleware } from "hono/factory";
import { logger } from "./logger";

/**
 * Bearer-token middleware. Resolves `orgId` from a Clerk JWT and attaches
 * it to the request context. Each tool handler reads `c.get("orgId")` (or
 * the wrapped `ctx.orgId` in the bridge) to scope its DB reads via RLS.
 *
 * Day-3 implementation:
 *   - Production: verify the bearer as a Clerk JWT (using @clerk/backend's
 *     `verifyToken`), require `org_id` claim. We dynamic-import to avoid
 *     pulling Clerk into apps/mcp's cold-start path when CLERK_SECRET_KEY
 *     is absent (e.g. local dev with the dev-stub).
 *   - Dev: accept the literal token `dev:<orgId>` and trust it. Lets us
 *     drive the MCP server from curl + tests without minting a real JWT.
 */
export interface McpEnv {
  Variables: { orgId: string };
}

const resolveOrgIdFromBearer = async (
  bearer: string
): Promise<{ orgId: string } | { error: string }> => {
  // Dev shortcut: `dev:<orgId>` for tests + curl.
  if (process.env.NODE_ENV !== "production" && bearer.startsWith("dev:")) {
    return { orgId: bearer.slice(4) };
  }

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    return {
      error: "CLERK_SECRET_KEY not set; can't verify production bearer tokens",
    };
  }
  try {
    const { verifyToken } = await import("@clerk/backend");
    const claims = await verifyToken(bearer, { secretKey: clerkSecretKey });
    const orgId = (claims as { org_id?: string }).org_id;
    if (!orgId) {
      return { error: "JWT lacks org_id claim" };
    }
    return { orgId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "verifyToken failed",
    };
  }
};

export const requireBearer = createMiddleware<McpEnv>(async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return c.json(
      { error: "unauthorized", reason: "missing bearer token" },
      401
    );
  }
  const bearer = auth.slice("bearer ".length).trim();
  const resolved = await resolveOrgIdFromBearer(bearer);
  if ("error" in resolved) {
    logger.warn({ reason: resolved.error }, "mcp middleware: bearer rejected");
    return c.json({ error: "unauthorized", reason: resolved.error }, 401);
  }
  c.set("orgId", resolved.orgId);
  await next();
});
