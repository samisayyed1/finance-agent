/**
 * Cross-tenant isolation harness.
 *
 * Validates the iron rule (CLAUDE.md #2 + #9): Org A's bearer token must
 * NEVER see Org B's data. Two flows are exercised:
 *
 *   1. App-layer scoping: each tool handler reads `ctx.orgId` from the
 *      bearer middleware and `where`-clauses every query on it. This test
 *      runs against a real Postgres (DATABASE_URL must be set + reachable)
 *      and seeds two orgs with the same date.
 *
 *   2. Postgres RLS: the migration in supabase/migrations/* also installs
 *      RLS policies reading `(auth.jwt() ->> 'org_id')`. A future revision
 *      of this test will set the auth context via `SET LOCAL` and assert
 *      RLS enforcement even if app-layer filtering were bypassed. For
 *      Day-3.1 the app-layer scope is the load-bearing guarantee; RLS is
 *      defense in depth.
 *
 * The test runs ONLY when `RLS_ISOLATION_DB_URL` is set (a separate env var
 * from `DATABASE_URL` so dev-only fake URLs don't trigger it). Unset by
 * default in CI; flip on for the manual rls-harness pass.
 */

import { describe, expect, it } from "vitest";

const RLS_TEST_DB = process.env.RLS_ISOLATION_DB_URL;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const TEST_DATE = "2026-05-07";

describe.skipIf(!RLS_TEST_DB)(
  "MCP RLS isolation (requires RLS_ISOLATION_DB_URL)",
  () => {
    it("each org sees only its own daily_metrics row", async () => {
      // Pin DATABASE_URL to the dedicated isolation DB before any module
      // import that touches @ai-cfo/database — keys() is read at first import.
      process.env.DATABASE_URL = RLS_TEST_DB;
      process.env.NODE_ENV = "test";

      const { serve } = await import("@hono/node-server");
      const { Hono } = await import("hono");
      const clientMod = await import(
        "@modelcontextprotocol/sdk/client/index.js"
      );
      const transportMod = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      const { handleMcpRequest } = await import("../src/hono-bridge");
      const middleware = await import("../src/middleware");
      const dbMod = await import("@ai-cfo/database");

      const port = 14_000 + Math.floor(Math.random() * 1000);
      const app = new Hono<{ Variables: { orgId: string } }>();
      app.use("/mcp/*", middleware.requireBearer);
      app.all("/mcp", (c) => handleMcpRequest(c, { orgId: c.get("orgId") }));
      const httpServer = serve({ fetch: app.fetch, port });
      const url = `http://localhost:${port}/mcp`;

      try {
        await dbMod.database
          .insert(dbMod.organizations)
          .values([
            { id: ORG_A, name: "Org A Iso", slug: "org-a-isolation" },
            { id: ORG_B, name: "Org B Iso", slug: "org-b-isolation" },
          ])
          .onConflictDoNothing();
        await dbMod.database
          .insert(dbMod.dailyMetrics)
          .values([
            {
              orgId: ORG_A,
              date: TEST_DATE,
              snapshotId: "snap-A",
              revenueGross: "111.00",
              revenueNet: "100.00",
              refunds: "11.00",
              fees: "0.00",
              orders: 1,
            },
            {
              orgId: ORG_B,
              date: TEST_DATE,
              snapshotId: "snap-B",
              revenueGross: "222.00",
              revenueNet: "200.00",
              refunds: "22.00",
              fees: "0.00",
              orders: 2,
            },
          ])
          .onConflictDoNothing();

        const callSnapshot = async (bearer: string) => {
          const transport = new transportMod.StreamableHTTPClientTransport(
            new URL(url),
            {
              requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
            }
          );
          const client = new clientMod.Client({
            name: "isolation-test",
            version: "0.0.0",
          });
          await client.connect(transport);
          try {
            const result = await client.callTool({
              name: "get_daily_snapshot",
              arguments: { date: TEST_DATE },
            });
            const first = (
              result.content as
                | Array<{ type?: string; text?: string }>
                | undefined
            )?.[0];
            const text = first?.text ?? "{}";
            return JSON.parse(text) as {
              snapshot_id: string;
              revenue_net: string | null;
            };
          } finally {
            await client.close();
          }
        };

        const a = await callSnapshot(`dev:${ORG_A}`);
        const b = await callSnapshot(`dev:${ORG_B}`);
        expect(a.snapshot_id).toBe("snap-A");
        expect(a.revenue_net).toBe("100.00");
        expect(b.snapshot_id).toBe("snap-B");
        expect(b.revenue_net).toBe("200.00");
        expect(JSON.stringify(a)).not.toContain("snap-B");
        expect(JSON.stringify(b)).not.toContain("snap-A");
      } finally {
        await new Promise<void>((resolve) =>
          (httpServer as unknown as { close: (cb: () => void) => void }).close(
            () => resolve()
          )
        );
      }
    });
  }
);

if (!RLS_TEST_DB) {
  describe("MCP RLS isolation (skipped: RLS_ISOLATION_DB_URL not set)", () => {
    it("documented harness — set RLS_ISOLATION_DB_URL to enable", () => {
      expect(true).toBe(true);
    });
  });
}
