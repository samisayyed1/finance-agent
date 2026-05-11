/**
 * DB-gated end-to-end seeder test. Skipped when DATABASE_URL is unset (e.g.
 * developer laptops without a local Supabase pointer; CI runs it).
 *
 * Coverage:
 *   1. `--reset` followed by a fresh seed yields N orders, N line items,
 *      and the same canonical row counts on a deterministic re-run.
 *   2. Idempotency: invoking runSeed twice with the same args produces the
 *      same final row counts (onConflictDoNothing across the inserts).
 *
 * The agent path is intentionally NOT exercised here — it depends on an
 * external paid API and a running MCP server. The non-agent pipeline is
 * the testable subset.
 *
 * Implementation note: imports of @ai-cfo/database eagerly evaluate the
 * env-validated DATABASE_URL at module-load. To keep the file cleanly
 * SKIPPED (rather than crashing) on a laptop without a DB pointer, all
 * DB-touching imports happen *inside* the `describe.skipIf` block via
 * dynamic import.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SLUG = `test-seed-${Date.now()}`;
const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("scripts/seed-demo-org runSeed", () => {
  // Hoisted handles populated by beforeAll; typed any because the dynamic
  // import is only resolved when the suite actually runs. Keeping the
  // module-load lazy is the entire point of this dance.
  let mod: any;
  let db: any;
  let orders: any;
  let orderLineItems: any;
  let payments: any;
  let adMetricsDaily: any;
  let organizations: any;
  let eq: any;
  let sql: any;
  let orgId: string | null = null;

  beforeAll(async () => {
    const dbMod = await import("@ai-cfo/database");
    db = dbMod.database;
    orders = dbMod.orders;
    orderLineItems = dbMod.orderLineItems;
    payments = dbMod.payments;
    adMetricsDaily = dbMod.adMetricsDaily;
    organizations = dbMod.organizations;
    eq = dbMod.eq;
    sql = dbMod.sql;
    mod = await import("../../seed-demo-org");

    const prior = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, SLUG))
      .limit(1);
    if (prior[0]) {
      orgId = prior[0].id;
    }
  });

  afterAll(async () => {
    if (!orgId) {
      return;
    }
    const tables = [
      "closed_loop_metrics",
      "agent_outcomes",
      "agent_feedback",
      "agent_traces",
      "agent_memories",
      "reports",
      "anomalies",
      "flag_status_history",
      "reconciliation_flags",
      "daily_metrics",
      "ad_metrics_daily",
      "ad_campaigns",
      "payouts",
      "refunds",
      "payments",
      "order_line_items",
      "orders",
      "raw_payloads",
      "sync_runs",
      "connection_alerts",
      "data_connections",
      "org_settings",
    ];
    for (const t of tables) {
      await db.execute(
        sql`DELETE FROM ${sql.identifier(t)} WHERE org_id = ${orgId}`
      );
    }
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }, 60_000);

  const countOrgRows = async (
    targetOrgId: string,
    table: any
  ): Promise<number> => {
    const rows = (await db.execute(
      sql`SELECT count(*)::int as c FROM ${table} WHERE org_id = ${targetOrgId}`
    )) as Array<{ c: number }>;
    return rows[0]?.c ?? 0;
  };

  it("seeds one day deterministically and re-runs idempotently", async () => {
    const first = (await mod.runSeed({
      slug: SLUG,
      reset: true,
      limitDays: 1,
      withAgentRuns: false,
      dryRun: false,
    })) as {
      orgId: string;
      rowsInserted: Record<string, number>;
    };
    orgId = first.orgId;
    expect(orgId).toBeTruthy();
    expect(first.rowsInserted.orders).toBeGreaterThan(0);

    const ordersAfterFirst = await countOrgRows(orgId, orders);
    const lineItemsAfterFirst = await db
      .select({ id: orderLineItems.id })
      .from(orderLineItems)
      .where(eq(orderLineItems.orgId, orgId));
    const paymentsAfterFirst = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orgId, orgId));
    const adMetricsAfterFirst = await db
      .select({ id: adMetricsDaily.id })
      .from(adMetricsDaily)
      .where(eq(adMetricsDaily.orgId, orgId));

    expect(ordersAfterFirst).toBeGreaterThan(0);
    expect(lineItemsAfterFirst.length).toBeGreaterThan(0);

    const second = (await mod.runSeed({
      slug: SLUG,
      reset: false,
      limitDays: 1,
      withAgentRuns: false,
      dryRun: false,
    })) as {
      orgId: string;
      rowsInserted: Record<string, number>;
    };
    expect(second.orgId).toBe(orgId);
    expect(second.rowsInserted.orders).toBe(0);

    const ordersAfterSecond = await countOrgRows(orgId, orders);
    const lineItemsAfterSecond = await db
      .select({ id: orderLineItems.id })
      .from(orderLineItems)
      .where(eq(orderLineItems.orgId, orgId));
    const paymentsAfterSecond = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orgId, orgId));
    const adMetricsAfterSecond = await db
      .select({ id: adMetricsDaily.id })
      .from(adMetricsDaily)
      .where(eq(adMetricsDaily.orgId, orgId));

    expect(ordersAfterSecond).toBe(ordersAfterFirst);
    expect(lineItemsAfterSecond.length).toBe(lineItemsAfterFirst.length);
    expect(paymentsAfterSecond.length).toBe(paymentsAfterFirst.length);
    expect(adMetricsAfterSecond.length).toBe(adMetricsAfterFirst.length);

    const dcRows = (await db.execute(
      sql`SELECT source FROM data_connections WHERE org_id = ${orgId} ORDER BY source`
    )) as Array<{ source: string }>;
    const sources = dcRows.map((r) => r.source);
    expect(sources).toContain("shopify");
    expect(sources).toContain("stripe");
    expect(sources).toContain("meta");
    expect(sources).toContain("google");
  }, 300_000);
});
