/**
 * Deterministic seed for the operator-dashboard pages. Inserts:
 *   - 1 organization
 *   - 30 days of `daily_metrics` ending on 2026-05-08
 *   - 2 anomalies
 *   - 1 open reconciliation flag
 *   - 1 data connection (Shopify, healthy)
 *   - 1 daily report
 *
 * Pure data — no Clerk wiring. The caller passes in a Drizzle client
 * (so this works against a test schema) and an org id.
 */

import {
  anomalies,
  dailyMetrics,
  dataConnections,
  organizations,
  reconciliationFlags,
  reports,
} from "@ai-cfo/database";

interface DrizzleClientLike {
  insert: (table: unknown) => {
    values: (rows: unknown) => { onConflictDoNothing?: () => Promise<unknown> };
  };
}

const TODAY = "2026-05-08";

const subDaysIso = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const seededDailyRows = (orgId: string, days: number) => {
  // Pseudo-random but deterministic: derive each metric from the index
  // so reruns produce the same shape.
  const out: unknown[] = [];
  for (let i = 0; i < days; i++) {
    const date = subDaysIso(TODAY, days - 1 - i);
    const baseRev = 9000 + i * 50;
    const orders = 80 + (i % 12);
    out.push({
      orgId,
      date,
      snapshotId: `snap_${date}`,
      revenueGross: baseRev.toFixed(4),
      revenueNet: (baseRev * 0.94).toFixed(4),
      refunds: (baseRev * 0.04).toFixed(4),
      fees: (baseRev * 0.02).toFixed(4),
      adSpend: (baseRev * 0.18).toFixed(4),
      grossMargin: (baseRev * 0.42).toFixed(4),
      contributionProfit: (baseRev * 0.21).toFixed(4),
      roas: (4 + (i % 5) * 0.1).toFixed(6),
      blendedMer: (3.2 + (i % 7) * 0.05).toFixed(6),
      cac: (24 + (i % 6)).toFixed(4),
      aov: (baseRev / orders).toFixed(4),
      orders,
      newCustomers: 30 + (i % 8),
      refundRate: ((i % 5) * 0.005 + 0.02).toFixed(6),
    });
  }
  return out;
};

export interface SeedTestOrgInput {
  /** The Drizzle client. Tests pass in their own scoped/test schema. */
  readonly db: DrizzleClientLike;
  readonly orgId: string;
  /** Org name. Defaults to "Acme Test Co". */
  readonly orgName?: string;
}

export const seedTestOrg = async ({
  db,
  orgId,
  orgName = "Acme Test Co",
}: SeedTestOrgInput): Promise<void> => {
  await (db
    .insert(organizations)
    .values({
      id: orgId,
      name: orgName,
      slug: `acme-test-${orgId.slice(0, 8)}`,
    })
    .onConflictDoNothing?.() ?? Promise.resolve());

  const rows = seededDailyRows(orgId, 30);
  await (db.insert(dailyMetrics).values(rows).onConflictDoNothing?.() ??
    Promise.resolve());

  await (db
    .insert(anomalies)
    .values([
      {
        orgId,
        anomalyId: `anom_${TODAY}_refund`,
        date: TODAY,
        metric: "refund_rate",
        severity: "high",
        zScore: "3.4",
        prevValue: "0.020000",
        currentValue: "0.045000",
        suggestedCause: "Refund spike — inspect Tue cohort.",
      },
      {
        orgId,
        anomalyId: `anom_${TODAY}_orders`,
        date: TODAY,
        metric: "orders",
        severity: "medium",
        zScore: "2.1",
        prevValue: "85",
        currentValue: "62",
        suggestedCause: "Order count below 7d mean.",
      },
    ])
    .onConflictDoNothing?.() ?? Promise.resolve());

  await (db
    .insert(reconciliationFlags)
    .values([
      {
        orgId,
        flagId: `flag_${TODAY}_001`,
        kind: "ORDER_MISSING_PAYMENT",
        orderId: "order_1234",
        expected: "152.4000",
        actual: "0.0000",
        delta: "-152.4000",
        status: "open",
      },
    ])
    .onConflictDoNothing?.() ?? Promise.resolve());

  await (db
    .insert(dataConnections)
    .values([
      {
        orgId,
        source: "shopify",
        status: "active",
        lastSyncedAt: new Date(`${TODAY}T07:00:00Z`),
      },
    ])
    .onConflictDoNothing?.() ?? Promise.resolve());

  await (db
    .insert(reports)
    .values([
      {
        orgId,
        date: TODAY,
        snapshotId: `snap_${TODAY}`,
        promptVersion: "daily-report-v1",
        model: "claude-opus-4-7",
        contentJsonb: { fixture: true },
        contentMd: `# Daily report — ${TODAY}\n\nRevenue closed at $13,395.00 [snapshot:snap_${TODAY}].`,
        deliveryStatus: {},
        aiTraceId: `trace_${TODAY}_fixture`,
      },
    ])
    .onConflictDoNothing?.() ?? Promise.resolve());
};
