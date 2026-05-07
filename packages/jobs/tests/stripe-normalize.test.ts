import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStripeEvent } from "@ai-cfo/connector-stripe";
import {
  database,
  eq,
  organizations,
  payments,
  payouts,
  refunds,
} from "@ai-cfo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyStripeEvents } from "../src/stripe-apply";

const FIXTURES = resolve(
  import.meta.dirname,
  "..",
  "..",
  "connectors",
  "stripe",
  "fixtures"
);
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), "utf-8"));

const SLUG = `test-stripe-norm-${Date.now()}`;
let orgId: string;

const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("stripe-normalize idempotency", () => {
  beforeAll(async () => {
    const inserted = await database
      .insert(organizations)
      .values({ name: "test-stripe-normalize", slug: SLUG })
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

  it("running normalize twice with charge.succeeded → identical state", async () => {
    const events = parseStripeEvent({
      orgId,
      rawEvent: fixture("charge-succeeded"),
    });

    await applyStripeEvents(events, orgId);
    const first = await database
      .select()
      .from(payments)
      .where(eq(payments.orgId, orgId));

    await applyStripeEvents(events, orgId);
    const second = await database
      .select()
      .from(payments)
      .where(eq(payments.orgId, orgId));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.feeAmount).toBe("6.56");
  });

  it("charge.refunded inserts a Refund linked to the existing Payment", async () => {
    await applyStripeEvents(
      parseStripeEvent({
        orgId,
        rawEvent: fixture("charge-refunded"),
      }),
      orgId
    );
    const refundRows = await database
      .select()
      .from(refunds)
      .where(eq(refunds.orgId, orgId));
    expect(refundRows.length).toBeGreaterThan(0);
    const refund = refundRows[0];
    if (!refund) {
      throw new Error("expected refund row");
    }
    expect(refund.amount).toBe("54.25");
    expect(refund.paymentId).not.toBeNull();
  });

  it("payout.created upserts a Payout in pending status", async () => {
    await applyStripeEvents(
      parseStripeEvent({
        orgId,
        rawEvent: fixture("payout-created"),
      }),
      orgId
    );
    const rows = await database
      .select()
      .from(payouts)
      .where(eq(payouts.orgId, orgId));
    expect(rows.length).toBeGreaterThan(0);
    const payout = rows.find((p) => p.sourcePayoutId === "po_test_payout_1");
    expect(payout?.status).toBe("pending");
    expect(payout?.grossAmount).toBe("2093.60");
  });

  it("charge.dispute.created emits no canonical events (Day-2 log only)", () => {
    const events = parseStripeEvent({
      orgId,
      rawEvent: fixture("charge-dispute-created"),
    });
    expect(events).toHaveLength(0);
  });
});
