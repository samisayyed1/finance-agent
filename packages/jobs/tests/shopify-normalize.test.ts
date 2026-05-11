/**
 * shopify-normalize idempotency integration tests.
 *
 * Gated on DATABASE_URL: skips cleanly when unset. DB-bound imports are
 * loaded inside `beforeAll` to keep the file from crashing at module
 * load when DATABASE_URL is absent (the env validator inside
 * @ai-cfo/database throws eagerly).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type NormalizedEvent, parseEvent } from "@ai-cfo/connector-shopify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURES = resolve(
  import.meta.dirname,
  "..",
  "..",
  "connectors",
  "shopify",
  "fixtures"
);
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), "utf-8"));

const SOURCE_ORDER_ID = "820982911946154508";
const SLUG = `test-jobs-shopify-${Date.now()}`;
const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("shopify-normalize idempotency", () => {
  let db: typeof import("@ai-cfo/database");
  let apply: typeof import("../src/shopify-apply");
  let orgId: string;

  beforeAll(async () => {
    db = await import("@ai-cfo/database");
    apply = await import("../src/shopify-apply");

    const inserted = await db.database
      .insert(db.organizations)
      .values({ name: "test-jobs-shopify", slug: SLUG })
      .returning({ id: db.organizations.id });
    const row = inserted[0];
    if (!row) {
      throw new Error("failed to create test org");
    }
    orgId = row.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.database
        .delete(db.organizations)
        .where(db.eq(db.organizations.id, orgId));
    }
  });

  const eventsFor = (
    topic:
      | "orders/create"
      | "orders/paid"
      | "refunds/create"
      | "orders/cancelled"
      | "orders/updated",
    name: string
  ): NormalizedEvent[] =>
    parseEvent({
      orgId,
      rawPayload: fixture(name),
      topic,
    }).map((e) => ({ ...e, orgId }));

  it("running normalize twice with the same input produces identical state", async () => {
    const events = eventsFor("orders/create", "orders-create");

    await apply.applyNormalizedEvents(events);
    const after1Orders = await db.database
      .select()
      .from(db.orders)
      .where(
        db.and(
          db.eq(db.orders.orgId, orgId),
          db.eq(db.orders.sourceOrderId, SOURCE_ORDER_ID)
        )
      );
    const after1Lines = await db.database
      .select()
      .from(db.orderLineItems)
      .where(db.eq(db.orderLineItems.orgId, orgId));

    await apply.applyNormalizedEvents(events);
    const after2Orders = await db.database
      .select()
      .from(db.orders)
      .where(
        db.and(
          db.eq(db.orders.orgId, orgId),
          db.eq(db.orders.sourceOrderId, SOURCE_ORDER_ID)
        )
      );
    const after2Lines = await db.database
      .select()
      .from(db.orderLineItems)
      .where(db.eq(db.orderLineItems.orgId, orgId));

    expect(after1Orders).toHaveLength(1);
    expect(after2Orders).toHaveLength(1);
    expect(after1Orders[0]?.id).toBe(after2Orders[0]?.id);
    expect(after1Orders[0]?.total).toBe(after2Orders[0]?.total);
    expect(after1Lines).toHaveLength(after2Lines.length);
  });

  it("orders/paid follow-up upserts financial_status and inserts a Payment", async () => {
    await apply.applyNormalizedEvents(eventsFor("orders/paid", "orders-paid"));
    const ord = await db.database
      .select()
      .from(db.orders)
      .where(
        db.and(
          db.eq(db.orders.orgId, orgId),
          db.eq(db.orders.sourceOrderId, SOURCE_ORDER_ID)
        )
      );
    expect(ord[0]?.financialStatus).toBe("paid");

    const pmts = await db.database
      .select()
      .from(db.payments)
      .where(db.eq(db.payments.orgId, orgId));
    expect(pmts.length).toBeGreaterThan(0);
    expect(pmts[0]?.status).toBe("paid");
  });

  it("orders/updated changes fulfillment_status without losing line items", async () => {
    await apply.applyNormalizedEvents(
      eventsFor("orders/updated", "orders-updated")
    );
    const ord = await db.database
      .select()
      .from(db.orders)
      .where(
        db.and(
          db.eq(db.orders.orgId, orgId),
          db.eq(db.orders.sourceOrderId, SOURCE_ORDER_ID)
        )
      );
    expect(ord[0]?.fulfillmentStatus).toBe("fulfilled");

    const lines = await db.database
      .select()
      .from(db.orderLineItems)
      .where(db.eq(db.orderLineItems.orgId, orgId));
    expect(lines.length).toBeGreaterThan(0);
  });

  it("refunds/create attaches to the existing order", async () => {
    await apply.applyNormalizedEvents(
      eventsFor("refunds/create", "refunds-create")
    );
    const refs = await db.database
      .select()
      .from(db.refunds)
      .where(db.eq(db.refunds.orgId, orgId));
    expect(refs).toHaveLength(1);
    expect(refs[0]?.amount).toBe("54.25");
    expect(refs[0]?.orderId).not.toBeNull();
  });

  it("orders/cancelled re-upserts with cancelled_at_source", async () => {
    await apply.applyNormalizedEvents(
      eventsFor("orders/cancelled", "orders-cancelled")
    );
    const ord = await db.database
      .select()
      .from(db.orders)
      .where(
        db.and(
          db.eq(db.orders.orgId, orgId),
          db.eq(db.orders.sourceOrderId, SOURCE_ORDER_ID)
        )
      );
    expect(ord[0]?.cancelledAtSource).not.toBeNull();
  });
});
