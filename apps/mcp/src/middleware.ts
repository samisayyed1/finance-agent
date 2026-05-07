import { createMiddleware } from "hono/factory";

/**
 * Bearer-token middleware (Day-0 stub).
 *
 * In production this validates the bearer token against our OAuth introspection
 * endpoint, resolves the org_id claim, and attaches it to the request context.
 * Tools then use the resolved org_id for RLS-scoped queries.
 *
 * Day-0 behaviour: in dev (NODE_ENV !== 'production'), accept any bearer
 * present and attach `org_id: "dev-stub-org"`. In prod, reject everything
 * (501) until OAuth lands.
 */
export interface McpEnv {
  Variables: { orgId: string };
}

export const requireBearer = createMiddleware<McpEnv>(async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return c.json(
      { error: "unauthorized", reason: "missing bearer token" },
      401
    );
  }
  if (process.env.NODE_ENV === "production") {
    return c.json(
      { error: "not_implemented", reason: "bearer validation stubbed" },
      501
    );
  }
  c.set("orgId", "dev-stub-org");
  await next();
});
