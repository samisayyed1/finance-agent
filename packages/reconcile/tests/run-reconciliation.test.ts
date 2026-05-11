/**
 * Integration test for runReconciliation against a live Supabase.
 *
 * Gated on DATABASE_URL: the suite skips cleanly when the env var is
 * unset. `@ai-cfo/database` + `../src/run-reconciliation` are loaded
 * dynamically inside `beforeAll` so the file doesn't crash at module
 * load when DATABASE_URL is absent (the env validator inside
 * @ai-cfo/database throws eagerly).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SLUG = `test-reconcile-${Date.now()}`;
const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("runReconciliation against live Supabase", () => {
  let db: typeof import("@ai-cfo/database");
  let recon: typeof import("../src/run-reconciliation");
  let orgId: string;

  const insertOrder = async (o: {
    sourceOrderId: string;
    total: string;
    createdAt: Date;
  }): Promise<void> => {
    await db.database.insert(db.orders).values({
      orgId,
      source: "shopify",
      sourceOrderId: o.sourceOrderId,
      currency: "USD",
      subtotal: o.total,
      total: o.total,
      financialStatus: "paid",
      createdAtSource: o.createdAt,
    });
  };

  const insertPayment = async (p: {
    sourcePaymentId: string;
    grossAmount: string;
    feeAmount?: string;
    processedAt: Date;
  }): Promise<void> => {
    const fee = p.feeAmount ?? "0.00";
    const grossMinor = Math.round(Number(p.grossAmount) * 100);
    const feeMinor = Math.round(Number(fee) * 100);
    const netMinor = grossMinor - feeMinor;
    await db.database.insert(db.payments).values({
      orgId,
      source: "stripe",
      sourcePaymentId: p.sourcePaymentId,
      grossAmount: p.grossAmount,
      feeAmount: fee,
      netAmount: (netMinor / 100).toFixed(2),
      currency: "USD",
      status: "succeeded",
      processedAt: p.processedAt,
    });
  };

  beforeAll(async () => {
    db = await import("@ai-cfo/database");
    recon = await import("../src/run-reconciliation");

    const inserted = await db.database
      .insert(db.organizations)
      .values({ name: "test-reconcile", slug: SLUG })
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

  it("empty window → 0 flags", async () => {
    const result = await recon.runReconciliation(orgId, {
      start: new Date("2030-01-01T00:00:00Z"),
      end: new Date("2030-01-02T00:00:00Z"),
    });
    expect(result.matched).toBe(0);
    expect(result.orderMissingPayment).toBe(0);
    expect(result.paymentWithoutOrder).toBe(0);
  });

  it("5 orders, 4 payments (1 missing) → exactly 1 ORDER_MISSING_PAYMENT flag (idempotent on rerun)", async () => {
    const day = new Date("2030-02-01T10:00:00Z");
    const window = {
      start: new Date("2030-02-01T00:00:00Z"),
      end: new Date("2030-02-02T00:00:00Z"),
    };
    for (let i = 0; i < 5; i++) {
      await insertOrder({
        sourceOrderId: `order-${i}`,
        total: `${100 + i}.00`,
        createdAt: new Date(day.getTime() + i * 60_000),
      });
    }
    for (let i = 0; i < 4; i++) {
      await insertPayment({
        sourcePaymentId: `ch_${i}`,
        grossAmount: `${100 + i}.00`,
        processedAt: new Date(day.getTime() + i * 60_000),
      });
    }

    const r1 = await recon.runReconciliation(orgId, window);
    expect(r1.matched).toBe(4);
    expect(r1.orderMissingPayment).toBe(1);
    expect(r1.paymentWithoutOrder).toBe(0);

    // Re-run: idempotent — same flag count, no duplicates.
    const r2 = await recon.runReconciliation(orgId, window);
    expect(r2.orderMissingPayment).toBe(1);

    const flagsForThisDay = await db.database
      .select()
      .from(db.reconciliationFlags)
      .where(db.eq(db.reconciliationFlags.orgId, orgId));
    const missing = flagsForThisDay.filter(
      (f) => f.kind === "ORDER_MISSING_PAYMENT"
    );
    expect(missing).toHaveLength(1);
  });

  it("4 orders, 5 payments (1 extra) → exactly 1 PAYMENT_WITHOUT_ORDER flag", async () => {
    const day = new Date("2030-03-01T10:00:00Z");
    const window = {
      start: new Date("2030-03-01T00:00:00Z"),
      end: new Date("2030-03-02T00:00:00Z"),
    };
    for (let i = 0; i < 4; i++) {
      await insertOrder({
        sourceOrderId: `mar-order-${i}`,
        total: `${200 + i}.00`,
        createdAt: new Date(day.getTime() + i * 60_000),
      });
    }
    for (let i = 0; i < 5; i++) {
      await insertPayment({
        sourcePaymentId: `mar_ch_${i}`,
        grossAmount: `${200 + i}.00`,
        processedAt: new Date(day.getTime() + i * 60_000),
      });
    }

    const r = await recon.runReconciliation(orgId, window);
    expect(r.matched).toBe(4);
    expect(r.paymentWithoutOrder).toBe(1);

    const flagsAll = await db.database
      .select()
      .from(db.reconciliationFlags)
      .where(db.eq(db.reconciliationFlags.orgId, orgId));
    const noOrder = flagsAll.filter((f) => f.kind === "PAYMENT_WITHOUT_ORDER");
    expect(noOrder.length).toBeGreaterThanOrEqual(1);
  });
});
