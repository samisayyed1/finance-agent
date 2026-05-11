/**
 * stripe-normalize idempotency integration tests.
 *
 * Gated on DATABASE_URL: skips cleanly when unset. DB-bound imports are
 * loaded inside `beforeAll` to keep the file from crashing at module
 * load when DATABASE_URL is absent (the env validator inside
 * @ai-cfo/database throws eagerly).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStripeEvent } from "@ai-cfo/connector-stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("stripe-normalize idempotency", () => {
  let db: typeof import("@ai-cfo/database");
  let apply: typeof import("../src/stripe-apply");
  let orgId: string;

  beforeAll(async () => {
    db = await import("@ai-cfo/database");
    apply = await import("../src/stripe-apply");

    const inserted = await db.database
      .insert(db.organizations)
      .values({ name: "test-stripe-normalize", slug: SLUG })
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

  it("running normalize twice with charge.succeeded → identical state", async () => {
    const events = parseStripeEvent({
      orgId,
      rawEvent: fixture("charge-succeeded"),
    });

    await apply.applyStripeEvents(events, orgId);
    const first = await db.database
      .select()
      .from(db.payments)
      .where(db.eq(db.payments.orgId, orgId));

    await apply.applyStripeEvents(events, orgId);
    const second = await db.database
      .select()
      .from(db.payments)
      .where(db.eq(db.payments.orgId, orgId));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.feeAmount).toBe("6.56");
  });

  it("charge.refunded inserts a Refund linked to the existing Payment", async () => {
    await apply.applyStripeEvents(
      parseStripeEvent({
        orgId,
        rawEvent: fixture("charge-refunded"),
      }),
      orgId
    );
    const refundRows = await db.database
      .select()
      .from(db.refunds)
      .where(db.eq(db.refunds.orgId, orgId));
    expect(refundRows.length).toBeGreaterThan(0);
    const refund = refundRows[0];
    if (!refund) {
      throw new Error("expected refund row");
    }
    expect(refund.amount).toBe("54.25");
    expect(refund.paymentId).not.toBeNull();
  });

  it("payout.created upserts a Payout in pending status", async () => {
    await apply.applyStripeEvents(
      parseStripeEvent({
        orgId,
        rawEvent: fixture("payout-created"),
      }),
      orgId
    );
    const rows = await db.database
      .select()
      .from(db.payouts)
      .where(db.eq(db.payouts.orgId, orgId));
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
