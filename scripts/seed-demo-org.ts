#!/usr/bin/env bun
/**
 * Day-8 demo data seeder. Single command populates one org with a rich,
 * deterministic, 90-day demo dataset (Maeve Co.) so /today, /metrics,
 * /analyst, and /settings/reconciliation all light up with real numbers.
 *
 * SEED ONLY — this script writes through the service-role connection and
 * therefore bypasses RLS. Production code never does this. The bypass is
 * scoped to:
 *   1. wiping a demo org's rows on `--reset`
 *   2. inserting freshly synthesized canonical rows
 *   3. invoking the same pipeline (computeDailyMetrics, runReconciliation,
 *      runAnomalyJobForDay) every production code path uses, with org_id
 *      arguments. The pipeline itself respects per-org scoping.
 *
 * Usage:
 *   bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand
 *   bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --reset --limit-days=1
 *   bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --dry-run
 *   bun run scripts/seed-demo-org.ts --slug=demo-shopify-brand --with-agent-runs
 *
 * When `--with-agent-runs` is set the orchestrator additionally
 *   - invokes the daily-report agent for each seeded day (writes
 *     agent_traces + reports rows),
 *   - distills agent_memories from the run's traces (one pass at the
 *     end of the loop), and
 *   - writes one closed_loop_metrics row per day.
 * The MCP server (apps/mcp) and ANTHROPIC_API_KEY must be reachable;
 * docs/runbooks/DEMO_VIDEO_SCRIPT.md spells out the two-terminal flow.
 */

import {
  adCampaigns,
  adMetricsDaily,
  and,
  database,
  dataConnections,
  eq,
  inArray,
  orderLineItems,
  orders,
  organizations,
  orgSettings,
  payments,
  payouts,
  refunds,
  sql,
} from "@ai-cfo/database";
import {
  createAnthropicDistiller,
  measureClosedLoopForOrg,
  writeMemoriesFromTracesForOrg,
} from "@ai-cfo/learning";
import { computeDailyMetrics } from "@ai-cfo/metrics";
import { runReconciliation } from "@ai-cfo/reconcile";
import pino from "pino";
import { runAgentForDay } from "./seed/agent-run-for-day";
import { runAnomalyJobForDay } from "./seed/anomaly-job";
import type { CliArgs } from "./seed/parse-args";
import { parseArgs } from "./seed/parse-args";
import { makeRng } from "./seed/rng";
import { maeveScenario } from "./seed/scenario-maeve";
import { synthesizeAdSpend } from "./seed/synthesize-ads";
import {
  type SynthesisWindow,
  type SyntheticOrder,
  synthesizeOrders,
} from "./seed/synthesize-orders";
import {
  type SyntheticPayment,
  type SyntheticPayout,
  type SyntheticRefund,
  synthesizeStripeForOrders,
} from "./seed/synthesize-stripe";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const minorToDecimal = (minor: number): string => {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
};

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

// Re-export CliArgs type so legacy callers that imported from this module
// keep working. The canonical home is scripts/seed/parse-args.ts.
export type { CliArgs } from "./seed/parse-args";

interface ResolvedOrg {
  id: string;
  name: string;
}

const ensureOrg = async (slug: string, name: string): Promise<ResolvedOrg> => {
  const existing = await database
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (existing[0]) {
    return existing[0];
  }
  const [inserted] = await database
    .insert(organizations)
    .values({ name, slug })
    .returning({ id: organizations.id, name: organizations.name });
  if (!inserted) {
    throw new Error(`ensureOrg: insert returned no rows for slug=${slug}`);
  }
  return inserted;
};

/**
 * Wipe org-scoped rows. Order matters: foreign keys cascade from organizations
 * downward, but explicit deletes are clearer and idempotent against partial
 * prior runs that left dangling rows after a hard interrupt.
 */
const resetOrg = async (orgId: string): Promise<void> => {
  // Tables referenced by org_id; deleted innermost-first.
  const stmts = [
    sql`DELETE FROM closed_loop_metrics WHERE org_id = ${orgId}`,
    sql`DELETE FROM org_thresholds WHERE org_id = ${orgId}`,
    sql`DELETE FROM org_eval_set WHERE org_id = ${orgId}`,
    sql`DELETE FROM agent_outcomes WHERE org_id = ${orgId}`,
    sql`DELETE FROM agent_feedback WHERE org_id = ${orgId}`,
    sql`DELETE FROM agent_traces WHERE org_id = ${orgId}`,
    sql`DELETE FROM agent_memories WHERE org_id = ${orgId}`,
    sql`DELETE FROM reports WHERE org_id = ${orgId}`,
    sql`DELETE FROM anomalies WHERE org_id = ${orgId}`,
    sql`DELETE FROM flag_status_history WHERE org_id = ${orgId}`,
    sql`DELETE FROM reconciliation_flags WHERE org_id = ${orgId}`,
    sql`DELETE FROM daily_metrics WHERE org_id = ${orgId}`,
    sql`DELETE FROM ad_metrics_daily WHERE org_id = ${orgId}`,
    sql`DELETE FROM ad_campaigns WHERE org_id = ${orgId}`,
    sql`DELETE FROM payouts WHERE org_id = ${orgId}`,
    sql`DELETE FROM refunds WHERE org_id = ${orgId}`,
    sql`DELETE FROM payments WHERE org_id = ${orgId}`,
    sql`DELETE FROM order_line_items WHERE org_id = ${orgId}`,
    sql`DELETE FROM orders WHERE org_id = ${orgId}`,
    sql`DELETE FROM raw_payloads WHERE org_id = ${orgId}`,
    sql`DELETE FROM sync_runs WHERE org_id = ${orgId}`,
    sql`DELETE FROM connection_alerts WHERE org_id = ${orgId}`,
    sql`DELETE FROM data_connections WHERE org_id = ${orgId}`,
    sql`DELETE FROM org_settings WHERE org_id = ${orgId}`,
  ];
  for (const s of stmts) {
    await database.execute(s);
  }
};

const ensureOrgSettings = async (orgId: string): Promise<void> => {
  await database
    .insert(orgSettings)
    .values({
      orgId,
      dailyReportTime: "07:00:00",
      dailyReportTimezone: "America/New_York",
      deliveryEmailEnabled: true,
      deliverySlackEnabled: true,
      deliveryWhatsappEnabled: false,
      monthlyPdfEnabled: true,
    })
    .onConflictDoNothing();
};

const ensureDataConnections = async (orgId: string): Promise<void> => {
  for (const source of ["shopify", "stripe", "meta", "google"] as const) {
    await database
      .insert(dataConnections)
      .values({
        orgId,
        source,
        status: "active",
        // demo-seeded — no real OAuth flow ran for this connection.
        encryptedCredentials: null,
        sourceMetadata: { demo: true, seededAt: new Date().toISOString() },
        lastSyncedAt: new Date(),
      })
      .onConflictDoNothing();
  }
};

interface InsertedOrderHandle {
  id: string;
  sourceOrderId: string;
}

const insertOrders = async (
  orgId: string,
  src: SyntheticOrder[]
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (src.length === 0) {
    return map;
  }
  const rows = src.map((o) => ({
    orgId,
    source: "shopify" as const,
    sourceOrderId: o.sourceOrderId,
    orderNumber: o.orderNumber,
    customerEmail: o.customerEmail,
    currency: o.currency,
    subtotal: minorToDecimal(o.subtotalMinor),
    totalTax: minorToDecimal(o.totalTaxMinor),
    totalShipping: minorToDecimal(o.totalShippingMinor),
    totalDiscount: minorToDecimal(o.totalDiscountMinor),
    total: minorToDecimal(o.totalMinor),
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    createdAtSource: o.createdAtSource,
    cancelledAtSource: o.cancelledAtSource,
    sourceMetadata: {
      attribution: o.attribution,
      raw: o.rawShopify,
      demo: true,
    },
  }));
  const inserted: InsertedOrderHandle[] = await database
    .insert(orders)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: orders.id, sourceOrderId: orders.sourceOrderId });
  for (const r of inserted) {
    map.set(r.sourceOrderId, r.id);
  }
  // Some rows may already have existed from a prior partial run — fill the
  // map by re-querying for those ids.
  if (inserted.length < src.length) {
    const sourceIds = src.map((o) => o.sourceOrderId);
    const existing = await database
      .select({ id: orders.id, sourceOrderId: orders.sourceOrderId })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, orgId),
          eq(orders.source, "shopify"),
          inArray(orders.sourceOrderId, sourceIds)
        )
      );
    for (const r of existing) {
      map.set(r.sourceOrderId, r.id);
    }
  }
  return map;
};

const insertLineItems = async (
  orgId: string,
  src: SyntheticOrder[],
  orderIdMap: Map<string, string>
): Promise<number> => {
  const rows: (typeof orderLineItems.$inferInsert)[] = [];
  for (const o of src) {
    const orderId = orderIdMap.get(o.sourceOrderId);
    if (!orderId) {
      continue;
    }
    for (const li of o.lineItems) {
      rows.push({
        orderId,
        orgId,
        sourceLineItemId: li.sourceLineItemId,
        sku: li.sku,
        productId: null,
        title: li.title,
        quantity: li.quantity,
        unitPrice: minorToDecimal(li.unitPriceMinor),
        totalDiscount: minorToDecimal(li.totalDiscountMinor),
        taxAmount: minorToDecimal(li.taxAmountMinor),
        sourceMetadata: { demo: true },
      });
    }
  }
  if (rows.length === 0) {
    return 0;
  }
  const inserted = await database
    .insert(orderLineItems)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: orderLineItems.id });
  return inserted.length;
};

const insertPayments = async (
  orgId: string,
  src: SyntheticPayment[],
  orderIdMap: Map<string, string>
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (src.length === 0) {
    return map;
  }
  const rows = src.map((p) => ({
    orgId,
    source: "stripe" as const,
    sourcePaymentId: p.sourcePaymentId,
    orderId: orderIdMap.get(p.sourceOrderRef) ?? null,
    grossAmount: minorToDecimal(p.grossMinor),
    feeAmount: minorToDecimal(p.feeMinor),
    netAmount: minorToDecimal(p.netMinor),
    currency: p.currency,
    status: p.status,
    processedAt: p.processedAt,
    sourceMetadata: { demo: true, sourceOrderId: p.sourceOrderRef },
  }));
  const inserted = await database
    .insert(payments)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: payments.id, sourcePaymentId: payments.sourcePaymentId });
  for (const r of inserted) {
    map.set(r.sourcePaymentId, r.id);
  }
  return map;
};

const insertRefunds = async (
  orgId: string,
  src: SyntheticRefund[],
  orderIdMap: Map<string, string>,
  paymentIdMap: Map<string, string>
): Promise<number> => {
  if (src.length === 0) {
    return 0;
  }
  const rows = src.map((r) => ({
    orgId,
    source: "stripe" as const,
    sourceRefundId: r.sourceRefundId,
    orderId: orderIdMap.get(r.sourceOrderRef) ?? null,
    paymentId: paymentIdMap.get(r.sourcePaymentRef) ?? null,
    amount: minorToDecimal(r.amountMinor),
    currency: r.currency,
    reason: r.reason,
    processedAt: r.processedAt,
    sourceMetadata: { demo: true },
  }));
  const inserted = await database
    .insert(refunds)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: refunds.id });
  return inserted.length;
};

const insertPayouts = async (
  orgId: string,
  src: SyntheticPayout[]
): Promise<number> => {
  if (src.length === 0) {
    return 0;
  }
  const rows = src.map((p) => ({
    orgId,
    source: "stripe" as const,
    sourcePayoutId: p.sourcePayoutId,
    grossAmount: minorToDecimal(p.grossMinor),
    feeAmount: minorToDecimal(p.feeMinor),
    netAmount: minorToDecimal(p.netMinor),
    currency: p.currency,
    status: p.status,
    periodStart: isoDate(p.periodStart),
    periodEnd: isoDate(p.periodEnd),
    expectedArrivalAt: p.expectedArrivalAt,
    arrivedAt: p.arrivedAt,
    sourceMetadata: { demo: true },
  }));
  const inserted = await database
    .insert(payouts)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: payouts.id });
  return inserted.length;
};

const insertAdsCampaigns = async (
  orgId: string,
  campaigns: {
    source: "meta" | "google";
    sourceCampaignId: string;
    name: string;
    status: string;
    objective: string;
    level: "campaign";
  }[]
): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (campaigns.length === 0) {
    return out;
  }
  const rows = campaigns.map((c) => ({
    orgId,
    source: c.source,
    sourceCampaignId: c.sourceCampaignId,
    name: c.name,
    status: c.status,
    objective: c.objective,
    parentCampaignId: null,
    level: c.level,
    sourceMetadata: { demo: true },
  }));
  await database.insert(adCampaigns).values(rows).onConflictDoNothing();
  // Re-query for ids since onConflictDoNothing won't return existing rows.
  for (const c of campaigns) {
    const found = await database
      .select({ id: adCampaigns.id })
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.orgId, orgId),
          eq(adCampaigns.source, c.source),
          eq(adCampaigns.sourceCampaignId, c.sourceCampaignId),
          eq(adCampaigns.level, c.level)
        )
      )
      .limit(1);
    if (found[0]) {
      out.set(`${c.source}:${c.sourceCampaignId}`, found[0].id);
    }
  }
  return out;
};

const insertAdMetricsDaily = async (
  orgId: string,
  metrics: {
    source: "meta" | "google";
    sourceCampaignId: string;
    date: Date;
    currency: string;
    spendMinor: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValueMinor: number;
  }[],
  campaignIdMap: Map<string, string>
): Promise<number> => {
  if (metrics.length === 0) {
    return 0;
  }
  const rows = metrics
    .map((m) => {
      const campaignId = campaignIdMap.get(`${m.source}:${m.sourceCampaignId}`);
      if (!campaignId) {
        return null;
      }
      return {
        orgId,
        source: m.source,
        campaignId,
        date: isoDate(m.date),
        currency: m.currency,
        spend: minorToDecimal(m.spendMinor),
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions.toFixed(2),
        conversionValue: minorToDecimal(m.conversionValueMinor),
        cpc: m.clicks > 0 ? (m.spendMinor / 100 / m.clicks).toFixed(4) : null,
        ctr: m.impressions > 0 ? (m.clicks / m.impressions).toFixed(6) : null,
        roasSource:
          m.spendMinor > 0
            ? (m.conversionValueMinor / m.spendMinor).toFixed(4)
            : null,
        sourceMetadata: { demo: true },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const inserted = await database
    .insert(adMetricsDaily)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: adMetricsDaily.id });
  return inserted.length;
};

interface SeedSummary {
  adMetricsInserted: number;
  agentRunsAttempted: number;
  agentRunsFailed: number;
  agentRunsSucceeded: number;
  campaignsInserted: number;
  closedLoopRowsWritten: number;
  daysProcessed: {
    day: string;
    snapshotId: string;
    flagsBefore: number;
    anomalyIds: string[];
    agentTraceId: string | null;
    agentRunError: string | null;
  }[];
  lineItemsInserted: number;
  memoriesWritten: number;
  ordersInserted: number;
  orgId: string;
  paymentsInserted: number;
  payoutsInserted: number;
  reconcileTotals: {
    matched: number;
    orderMissingPayment: number;
    paymentWithoutOrder: number;
    feeDriftFlags: number;
    attributionMismatchFlags: number;
  };
  refundsInserted: number;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrator stitches synthesis + DB insert + daily pipeline + optional agent/memory/closed-loop phases; splitting it would obscure the linear plan-of-record
export const runSeed = async (args: CliArgs): Promise<unknown> => {
  log.info({ args }, "seed-demo-org: start");

  if (args.dryRun) {
    log.info("dry-run: no DB writes will be performed");
  }
  if (args.withAgentRuns) {
    if (!process.env.MCP_SERVER_URL) {
      throw new Error(
        "--with-agent-runs set but MCP_SERVER_URL is unset; start apps/mcp (bun --bun dev) and export MCP_SERVER_URL=http://localhost:3010/mcp"
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "--with-agent-runs set but ANTHROPIC_API_KEY is unset; required for the Claude Agent SDK transport"
      );
    }
    log.info(
      { mcpServerUrl: process.env.MCP_SERVER_URL },
      "--with-agent-runs enabled: per-day agent runs + memory distillation + closed-loop snapshots"
    );
  }

  // Filter scenario to one bundled brand for now; future scenarios
  // (saas-brand, agency-brand) plug in as additional Scenario constants.
  const scenario = maeveScenario;
  if (scenario.orgSlug !== args.slug) {
    log.warn(
      { configuredSlug: scenario.orgSlug, argSlug: args.slug },
      "scenario.orgSlug does not match --slug; using --slug for org identity but scenario shape comes from maeveScenario"
    );
  }

  const today = startOfUtcDay(new Date());
  const window: SynthesisWindow = {
    start: new Date(today.getTime() - (args.limitDays - 1) * ONE_DAY_MS),
    end: today,
  };

  log.info(
    { window: { start: isoDate(window.start), end: isoDate(window.end) } },
    "synthesis window"
  );

  // Synthesis is pure & deterministic. Same seed = same data.
  const rng = makeRng(`${args.slug}-v1`);
  const synthOrders = synthesizeOrders(scenario, rng, window);
  const synthStripe = synthesizeStripeForOrders(
    synthOrders,
    scenario,
    rng,
    today
  );
  const synthAds = synthesizeAdSpend(synthOrders, scenario, rng, today);

  log.info(
    {
      orders: synthOrders.length,
      payments: synthStripe.payments.length,
      refunds: synthStripe.refunds.length,
      payouts: synthStripe.payouts.length,
      campaigns: synthAds.campaigns.length,
      adMetrics: synthAds.metricsDaily.length,
    },
    "synthesis complete"
  );

  if (args.dryRun) {
    log.info("dry-run done; exiting before any DB write");
    process.exit(0);
  }

  // ---- DB writes ----
  const org = await ensureOrg(args.slug, scenario.orgName);
  log.info({ orgId: org.id, name: org.name }, "org resolved");

  if (args.reset) {
    log.info("--reset: wiping prior org data");
    await resetOrg(org.id);
    // Re-insert org since resetOrg also wipes data_connections etc. but
    // the organization row itself is preserved. (Org deletion would
    // cascade-delete users/auth links — out of scope for this seed.)
  }

  await ensureOrgSettings(org.id);
  await ensureDataConnections(org.id);

  const orderIdMap = await insertOrders(org.id, synthOrders);
  log.info({ count: orderIdMap.size }, "orders inserted");

  const lineItemsCount = await insertLineItems(org.id, synthOrders, orderIdMap);
  const paymentIdMap = await insertPayments(
    org.id,
    synthStripe.payments,
    orderIdMap
  );
  const refundsCount = await insertRefunds(
    org.id,
    synthStripe.refunds,
    orderIdMap,
    paymentIdMap
  );
  const payoutsCount = await insertPayouts(org.id, synthStripe.payouts);

  const campaignIdMap = await insertAdsCampaigns(org.id, synthAds.campaigns);
  const adMetricsCount = await insertAdMetricsDaily(
    org.id,
    synthAds.metricsDaily,
    campaignIdMap
  );

  log.info(
    {
      lineItems: lineItemsCount,
      payments: paymentIdMap.size,
      refunds: refundsCount,
      payouts: payoutsCount,
      campaigns: campaignIdMap.size,
      adMetrics: adMetricsCount,
    },
    "canonical rows inserted"
  );

  // ---- Pipeline runs ----
  const summary: SeedSummary = {
    orgId: org.id,
    ordersInserted: orderIdMap.size,
    lineItemsInserted: lineItemsCount,
    paymentsInserted: paymentIdMap.size,
    refundsInserted: refundsCount,
    payoutsInserted: payoutsCount,
    campaignsInserted: campaignIdMap.size,
    adMetricsInserted: adMetricsCount,
    daysProcessed: [],
    reconcileTotals: {
      matched: 0,
      orderMissingPayment: 0,
      paymentWithoutOrder: 0,
      feeDriftFlags: 0,
      attributionMismatchFlags: 0,
    },
    agentRunsAttempted: 0,
    agentRunsSucceeded: 0,
    agentRunsFailed: 0,
    closedLoopRowsWritten: 0,
    memoriesWritten: 0,
  };

  for (
    let cursor = window.start.getTime();
    cursor <= window.end.getTime();
    cursor += ONE_DAY_MS
  ) {
    const day = new Date(cursor);
    const dayLabel = isoDate(day);
    log.info({ day: dayLabel }, "pipeline: compute_daily_metrics");
    const metrics = await computeDailyMetrics({ orgId: org.id, date: day });

    log.info({ day: dayLabel }, "pipeline: runReconciliation");
    const recon = await runReconciliation(org.id, { start: day, end: day });
    summary.reconcileTotals.matched += recon.matched;
    summary.reconcileTotals.orderMissingPayment += recon.orderMissingPayment;
    summary.reconcileTotals.paymentWithoutOrder += recon.paymentWithoutOrder;
    summary.reconcileTotals.feeDriftFlags += recon.feeDriftFlags;
    summary.reconcileTotals.attributionMismatchFlags +=
      recon.attributionMismatchFlags;

    log.info({ day: dayLabel }, "pipeline: runAnomalyJobForDay");
    const anomalyResult = await runAnomalyJobForDay({
      orgId: org.id,
      date: day,
    });

    // Phase 4: optional agent run. The agent driving Claude → MCP → DB
    // is the only piece that hits an external paid API, so it's gated
    // behind an explicit flag.
    let agentTraceId: string | null = null;
    let agentRunError: string | null = null;
    if (args.withAgentRuns) {
      summary.agentRunsAttempted += 1;
      log.info({ day: dayLabel }, "pipeline: runAgentForDay");
      const agentResult = await runAgentForDay({
        orgId: org.id,
        orgName: org.name,
        date: day,
        snapshotId: metrics.snapshot_id,
      });
      if (agentResult.ok) {
        agentTraceId = agentResult.traceId;
        summary.agentRunsSucceeded += 1;
      } else {
        agentRunError = agentResult.error ?? agentResult.reason;
        summary.agentRunsFailed += 1;
        log.warn(
          { day: dayLabel, reason: agentResult.reason, error: agentRunError },
          "agent run failed; continuing with remaining days"
        );
      }
    }

    summary.daysProcessed.push({
      day: dayLabel,
      snapshotId: metrics.snapshot_id,
      flagsBefore: 0,
      anomalyIds: anomalyResult.anomalyIds,
      agentTraceId,
      agentRunError,
    });
  }

  // Phase 5: distill memories from traces written during this run. Single
  // pass at the end so every day's trace is in scope; the production daily
  // job runs every 00:30 UTC on a 24h sliding window. We pin `since` to the
  // earliest day so the entire seeded history feeds the distiller.
  if (args.withAgentRuns && summary.agentRunsSucceeded > 0) {
    log.info("phase 5: writeMemoriesFromTraces (full seeded window)");
    try {
      const memorySummary = await writeMemoriesFromTracesForOrg(
        org.id,
        org.name,
        window.start,
        { callModel: createAnthropicDistiller() }
      );
      summary.memoriesWritten = memorySummary.written;
      log.info(
        {
          written: memorySummary.written,
          dropped: memorySummary.dropped,
        },
        "phase 5 complete"
      );
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "phase 5: writeMemoriesFromTracesForOrg failed; continuing"
      );
    }
  }

  // Phase 6: per-day closed-loop snapshot. measureClosedLoopForOrg writes
  // one row per day into `closed_loop_metrics`. We re-anchor `since` to
  // 24h before each seeded day so the per-day window only ingests that
  // day's traces, mirroring the production daily cadence.
  if (args.withAgentRuns) {
    log.info("phase 6: measureClosedLoopForOrg per day");
    for (const d of summary.daysProcessed) {
      const day = new Date(`${d.day}T00:00:00.000Z`);
      const since = new Date(day.getTime() - ONE_DAY_MS);
      try {
        await measureClosedLoopForOrg(org.id, since, d.day);
        summary.closedLoopRowsWritten += 1;
      } catch (err) {
        log.warn(
          {
            day: d.day,
            err: err instanceof Error ? err.message : String(err),
          },
          "measureClosedLoopForOrg failed for day; continuing"
        );
      }
    }
    log.info(
      { rowsWritten: summary.closedLoopRowsWritten },
      "phase 6 complete"
    );
  }

  // ---- Print summary ----
  const printable = {
    orgId: summary.orgId,
    rowsInserted: {
      orders: summary.ordersInserted,
      lineItems: summary.lineItemsInserted,
      payments: summary.paymentsInserted,
      refunds: summary.refundsInserted,
      payouts: summary.payoutsInserted,
      adCampaigns: summary.campaignsInserted,
      adMetricsDaily: summary.adMetricsInserted,
    },
    pipeline: {
      daysProcessed: summary.daysProcessed.length,
      reconcileTotals: summary.reconcileTotals,
      anomaliesPersisted: summary.daysProcessed.reduce(
        (s, d) => s + d.anomalyIds.length,
        0
      ),
    },
    closedLoop: {
      agentRunsAttempted: summary.agentRunsAttempted,
      agentRunsSucceeded: summary.agentRunsSucceeded,
      agentRunsFailed: summary.agentRunsFailed,
      memoriesWritten: summary.memoriesWritten,
      closedLoopRowsWritten: summary.closedLoopRowsWritten,
    },
    sampleDay: summary.daysProcessed.at(-1) ?? null,
  };
  log.info({ summary: printable }, "seed-demo-org: done");
  process.stdout.write(`\n${JSON.stringify(printable, null, 2)}\n`);
  return printable;
};

// CLI entry-point guard. When this module is imported by a test, the bottom
// invocation is skipped (no DB connection, no exit). `import.meta.main` is
// true only when Bun executes the file directly via `bun run`.
if (import.meta.main) {
  runSeed(parseArgs(process.argv.slice(2)))
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      log.error({ err }, "seed-demo-org: FAILED");
      process.exit(1);
    });
}
