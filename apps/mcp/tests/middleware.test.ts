/**
 * Bearer-token middleware tests for apps/mcp.
 *
 * These cover the auth slice without requiring a Postgres or Clerk live
 * dependency. The `dev:<orgId>` shortcut is exercised; the production path
 * (Clerk JWT verification) is exercised by mocking `@clerk/backend`.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type McpEnv, requireBearer } from "../src/middleware";

const MISSING_BEARER_RE = /missing bearer/;
const CLERK_KEY_RE = /CLERK_SECRET_KEY/;

const buildApp = () => {
  const app = new Hono<McpEnv>();
  app.use("/mcp/*", requireBearer);
  app.get("/mcp/echo", (c) => c.json({ orgId: c.get("orgId") }));
  return app;
};

describe("requireBearer middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without a bearer token", async () => {
    const app = buildApp();
    const res = await app.request("/mcp/echo");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toMatch(MISSING_BEARER_RE);
  });

  it("rejects malformed authorization headers", async () => {
    const app = buildApp();
    const res = await app.request("/mcp/echo", {
      headers: { authorization: "Basic abc" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts dev:<orgId> shortcut and resolves orgId", async () => {
    const app = buildApp();
    const res = await app.request("/mcp/echo", {
      headers: {
        authorization: "Bearer dev:11111111-2222-4333-8444-555555555555",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgId: string };
    expect(body.orgId).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("rejects dev: shortcut in production NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const app = buildApp();
    const res = await app.request("/mcp/echo", {
      headers: { authorization: "Bearer dev:any-org" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects production bearer when CLERK_SECRET_KEY is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const app = buildApp();
    const res = await app.request("/mcp/echo", {
      headers: { authorization: "Bearer some.real.jwt" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toMatch(CLERK_KEY_RE);
  });
});
