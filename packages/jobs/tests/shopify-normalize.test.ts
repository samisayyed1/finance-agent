import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type NormalizedEvent, parseEvent } from "@ai-cfo/connector-shopify";
import {
  and,
  database,
  eq,
  orderLineItems,
  orders,
  organizations,
  payments,
  refunds,
} from "@ai-cfo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyNormalizedEvents } from "../src/shopify-apply";

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
let orgId: string;

const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("shopify-normalize idempotency", () => {
  beforeAll(async () => {
    const inserted = await database
      .insert(organizations)
      .values({ name: "test-jobs-shopify", slug: SLUG })
      .returning({ id: organizations.id });
    const row = inserted[0];
    if (!row) {
      throw new Error("failed to create test org");
    }
    orgId = row.id;
  });

  afterAll(async () => {
    if (orgId) {
      await database.delete(organizations).where(eq(organizations.id, orgId));
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

    await applyNormalizedEvents(events);
    const after1Orders = await database
      .select()
      .from(orders)
      .where(
        and(eq(orders.orgId, orgId), eq(orders.sourceOrderId, SOURCE_ORDER_ID))
      );
    const after1Lines = await database
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.orgId, orgId));

    await applyNormalizedEvents(events);
    const after2Orders = await database
      .select()
      .from(orders)
      .where(
        and(eq(orders.orgId, orgId), eq(orders.sourceOrderId, SOURCE_ORDER_ID))
      );
    const after2Lines = await database
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.orgId, orgId));

    expect(after1Orders).toHaveLength(1);
    expect(after2Orders).toHaveLength(1);
    expect(after1Orders[0]?.id).toBe(after2Orders[0]?.id);
    expect(after1Orders[0]?.total).toBe(after2Orders[0]?.total);
    expect(after1Lines).toHaveLength(after2Lines.length);
  });

  it("orders/paid follow-up upserts financial_status and inserts a Payment", async () => {
    await applyNormalizedEvents(eventsFor("orders/paid", "orders-paid"));
    const ord = await database
      .select()
      .from(orders)
      .where(
        and(eq(orders.orgId, orgId), eq(orders.sourceOrderId, SOURCE_ORDER_ID))
      );
    expect(ord[0]?.financialStatus).toBe("paid");

    const pmts = await database
      .select()
      .from(payments)
      .where(eq(payments.orgId, orgId));
    expect(pmts.length).toBeGreaterThan(0);
    expect(pmts[0]?.status).toBe("paid");
  });

  it("orders/updated changes fulfillment_status without losing line items", async () => {
    await applyNormalizedEvents(eventsFor("orders/updated", "orders-updated"));
    const ord = await database
      .select()
      .from(orders)
      .where(
        and(eq(orders.orgId, orgId), eq(orders.sourceOrderId, SOURCE_ORDER_ID))
      );
    expect(ord[0]?.fulfillmentStatus).toBe("fulfilled");

    const lines = await database
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.orgId, orgId));
    expect(lines.length).toBeGreaterThan(0);
  });

  it("refunds/create attaches to the existing order", async () => {
    await applyNormalizedEvents(eventsFor("refunds/create", "refunds-create"));
    const refs = await database
      .select()
      .from(refunds)
      .where(eq(refunds.orgId, orgId));
    expect(refs).toHaveLength(1);
    expect(refs[0]?.amount).toBe("54.25");
    expect(refs[0]?.orderId).not.toBeNull();
  });

  it("orders/cancelled re-upserts with cancelled_at_source", async () => {
    await applyNormalizedEvents(
      eventsFor("orders/cancelled", "orders-cancelled")
    );
    const ord = await database
      .select()
      .from(orders)
      .where(
        and(eq(orders.orgId, orgId), eq(orders.sourceOrderId, SOURCE_ORDER_ID))
      );
    expect(ord[0]?.cancelledAtSource).not.toBeNull();
  });
});
