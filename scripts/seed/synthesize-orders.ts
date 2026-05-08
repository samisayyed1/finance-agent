/**
 * 90-day synthetic Shopify order stream for one demo brand. Pure function:
 * given (scenario, rng, window) it returns the same orders forever.
 *
 * Money is carried as integer minor-units (cents). No arithmetic happens on
 * raw `number`-as-currency — sums land in the orchestrator via Dinero.js
 * before the DB boundary.
 */

import {
  extractOrderAttribution,
  type OrderAttribution,
} from "@ai-cfo/connector-shopify";
import type { Rng } from "./rng";
import type { AnomalyDef, Channel, Scenario } from "./scenario-maeve";
import { buildLandingSite, buildReferringSite } from "./utm-helpers";

export interface SyntheticLineItem {
  quantity: number;
  sku: string;
  sourceLineItemId: string;
  taxAmountMinor: number;
  title: string;
  totalDiscountMinor: number;
  unitPriceMinor: number;
}

export interface SyntheticOrder {
  /** Attribution shape that ends up in `orders.source_metadata.attribution`. */
  attribution: OrderAttribution;
  /** Used by Stripe synthesis to choose whether to drop the payment. */
  attributionChannel: Channel;
  cancelledAtSource: Date | null;
  createdAtSource: Date;
  currency: string;
  customerEmail: string;
  financialStatus: "paid" | "pending" | "refunded";
  fulfillmentStatus: "fulfilled" | "unfulfilled" | "partial";
  lineItems: SyntheticLineItem[];
  orderNumber: string;
  /** What the Shopify connector would have produced — landing/referring/source. */
  rawShopify: {
    landing_site: string | null;
    referring_site: string | null;
    source_name: string | null;
  };
  sourceOrderId: string;
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalMinor: number;
  totalShippingMinor: number;
  totalTaxMinor: number;
}

export interface SynthesisWindow {
  /** Inclusive UTC day-start of the last synthesized day (= "today"). */
  end: Date;
  /** Inclusive UTC day-start of the first synthesized day. */
  start: Date;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Ratio is the fraction of a 24h day at which the order is created. */
const dayWithJitter = (dayStart: Date, ratio: number): Date =>
  new Date(dayStart.getTime() + Math.floor(ratio * ONE_DAY_MS));

const dayOffsetFromEnd = (day: Date, end: Date): number =>
  Math.round((day.getTime() - end.getTime()) / ONE_DAY_MS);

const dowKey = (d: Date): "0" | "1" | "2" | "3" | "4" | "5" | "6" => {
  const k = d.getUTCDay().toString();
  if (
    k === "0" ||
    k === "1" ||
    k === "2" ||
    k === "3" ||
    k === "4" ||
    k === "5" ||
    k === "6"
  ) {
    return k;
  }
  throw new Error(`unreachable dow key: ${k}`);
};

const inAnomalyWindow = (daysAgo: number, a: AnomalyDef): boolean =>
  daysAgo <= a.daysAgoStart && daysAgo >= a.daysAgoEnd;

const findAnomaly = (
  daysAgo: number,
  scenario: Scenario,
  kind: AnomalyDef["kind"]
): AnomalyDef | null =>
  scenario.anomalies.find(
    (a) => a.kind === kind && inAnomalyWindow(daysAgo, a)
  ) ?? null;

interface ChannelCdfEntry {
  channel: Channel;
  cumulative: number;
}

const buildAttributionCdf = (s: Scenario): ChannelCdfEntry[] => {
  const entries: ChannelCdfEntry[] = [];
  let cum = 0;
  for (const ch of ["meta", "google", "organic", "klaviyo", "other"] as const) {
    cum += s.attribution[ch];
    entries.push({ channel: ch, cumulative: cum });
  }
  return entries;
};

const drawChannel = (rng: Rng, cdf: ChannelCdfEntry[]): Channel => {
  const r = rng.nextFloat();
  for (const e of cdf) {
    if (r <= e.cumulative) {
      return e.channel;
    }
  }
  // Cumulative may sum slightly under 1.0 after Zod-validated weights; fall
  // back to the last bucket rather than throwing.
  return cdf.at(-1)?.channel ?? "organic";
};

const customerEmail = (
  rng: Rng,
  slug: string,
  customerPoolSize: number
): string => {
  const id = rng.nextInt(1, customerPoolSize);
  return `customer${id}@${slug}.demo`;
};

const sampleAovUsd = (rng: Rng, s: Scenario): number => {
  const mean = (s.aovUsdMin + s.aovUsdMax) / 2;
  const stddev = (s.aovUsdMax - s.aovUsdMin) / 4;
  const draw = rng.nextNormal(mean, stddev);
  if (draw < s.aovUsdMin) {
    return s.aovUsdMin;
  }
  if (draw > s.aovUsdMax) {
    return s.aovUsdMax;
  }
  return draw;
};

interface DayContext {
  day: Date;
  daysAgo: number;
  isOrderSurgeDay: boolean;
  isRefundSpikeDay: boolean;
}

const buildDayContext = (
  day: Date,
  end: Date,
  scenario: Scenario
): DayContext => {
  const daysAgo = dayOffsetFromEnd(day, end);
  return {
    day,
    daysAgo,
    isOrderSurgeDay:
      findAnomaly(daysAgo, scenario, "NEW_CUSTOMER_SURGE") !== null,
    isRefundSpikeDay: findAnomaly(daysAgo, scenario, "REFUND_SPIKE") !== null,
  };
};

const targetOrderCount = (
  rng: Rng,
  scenario: Scenario,
  ctx: DayContext
): number => {
  const dow = scenario.dowMultipliers[dowKey(ctx.day)] ?? 1;
  const noise = 1 + rng.nextNormal(0, 0.08);
  const base = scenario.baseOrdersPerDay * dow * Math.max(noise, 0.4);
  const surge = ctx.isOrderSurgeDay ? 3 : 1;
  return Math.max(1, Math.round(base * surge));
};

const buildLineItemsForOrder = (
  rng: Rng,
  scenario: Scenario,
  orderIdx: number
): SyntheticLineItem[] => {
  // Items emerge from SKU draws — line subtotal IS the AOV. The scenario's
  // baseOrdersPerDay × E[lineSubtotal] is sized to hit baseRevenuePerDayUsd.
  const itemCount = rng.nextInt(1, 3);
  const items: SyntheticLineItem[] = [];
  for (let i = 0; i < itemCount; i++) {
    const sku = rng.nextChoice(scenario.skuPool);
    const quantity = rng.nextInt(1, 2);
    const lineMinor = quantity * sku.unitPriceMinor;
    const taxMinor = Math.round(lineMinor * 0.07);
    items.push({
      sourceLineItemId: `li_demo_${orderIdx}_${i}`,
      sku: sku.sku,
      title: sku.title,
      quantity,
      unitPriceMinor: sku.unitPriceMinor,
      totalDiscountMinor: 0,
      taxAmountMinor: taxMinor,
    });
  }
  return items;
};

const drawFinancialStatus = (
  rng: Rng,
  ctx: DayContext
): SyntheticOrder["financialStatus"] => {
  if (ctx.isRefundSpikeDay) {
    // Boost refunded share to ~12% (vs baseline ~2%) on spike days.
    if (rng.nextBool(0.12)) {
      return "refunded";
    }
  } else if (rng.nextBool(0.022)) {
    return "refunded";
  }
  if (rng.nextBool(0.03)) {
    return "pending";
  }
  return "paid";
};

const drawFulfillmentStatus = (
  rng: Rng,
  fin: SyntheticOrder["financialStatus"]
): SyntheticOrder["fulfillmentStatus"] => {
  if (fin === "pending") {
    return "unfulfilled";
  }
  if (fin === "refunded") {
    return rng.nextBool(0.5) ? "fulfilled" : "partial";
  }
  return rng.nextBool(0.96) ? "fulfilled" : "unfulfilled";
};

const buildOrderAttribution = (
  channel: Channel,
  weekIdx: number,
  creativeId: number
): {
  rawShopify: SyntheticOrder["rawShopify"];
  attribution: OrderAttribution;
} => {
  const campaignFor = (c: Channel): string | undefined => {
    if (c === "meta") {
      return `fb_acq_w${weekIdx}`;
    }
    if (c === "google") {
      return `g_branded_w${weekIdx}`;
    }
    if (c === "klaviyo") {
      return "klaviyo_welcome";
    }
    return undefined;
  };
  const campaign = campaignFor(channel);
  const content = channel === "meta" ? `ad_creative_${creativeId}` : undefined;
  const landing = buildLandingSite({ channel, campaign, content });
  const referring = buildReferringSite(channel);
  const source_name = channel === "meta" ? "fb_pixel" : "web";
  const attribution = extractOrderAttribution({
    landing_site: landing,
    referring_site: referring,
    source_name,
  });
  return {
    rawShopify: {
      landing_site: landing,
      referring_site: referring,
      source_name,
    },
    attribution,
  };
};

export const synthesizeOrders = (
  scenario: Scenario,
  rng: Rng,
  window: SynthesisWindow
): SyntheticOrder[] => {
  const cdf = buildAttributionCdf(scenario);
  const out: SyntheticOrder[] = [];
  const start = startOfUtcDay(window.start);
  const end = startOfUtcDay(window.end);

  let orderIdx = 0;
  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += ONE_DAY_MS
  ) {
    const day = new Date(cursor);
    const ctx = buildDayContext(day, end, scenario);

    const orderCount = targetOrderCount(rng, scenario, ctx);
    const weekIdx = Math.floor(Math.abs(ctx.daysAgo) / 7);

    for (let i = 0; i < orderCount; i++) {
      orderIdx++;
      // Burn a draw to keep Box-Muller pairing aligned with prior versions
      // of this synthesizer; AOV is now a derived value, not a sample.
      sampleAovUsd(rng, scenario);
      const lineItems = buildLineItemsForOrder(rng, scenario, orderIdx);
      const lineSubtotal = lineItems.reduce(
        (s, li) => s + li.unitPriceMinor * li.quantity,
        0
      );
      const lineTax = lineItems.reduce((s, li) => s + li.taxAmountMinor, 0);
      const shippingMinor = rng.nextChoice([0, 500, 800, 1200] as const);
      const totalMinor = lineSubtotal + lineTax + shippingMinor;

      const channel = drawChannel(rng, cdf);
      const creativeId = rng.nextInt(1, 12);
      const { rawShopify, attribution } = buildOrderAttribution(
        channel,
        weekIdx,
        creativeId
      );

      const fin = drawFinancialStatus(rng, ctx);
      const fulfillment = drawFulfillmentStatus(rng, fin);
      const cancelled = !ctx.isOrderSurgeDay && rng.nextBool(0.01);

      const ratio = (i + 0.5) / orderCount;
      const createdAt = dayWithJitter(day, ratio);

      out.push({
        sourceOrderId: `gid://shopify/Order/demo-${orderIdx}`,
        orderNumber: `1${(1000 + orderIdx).toString()}`,
        customerEmail: customerEmail(
          rng,
          scenario.orgSlug,
          scenario.customerPoolSize
        ),
        currency: scenario.currency,
        subtotalMinor: lineSubtotal,
        totalTaxMinor: lineTax,
        totalShippingMinor: shippingMinor,
        totalDiscountMinor: 0,
        totalMinor,
        financialStatus: fin,
        fulfillmentStatus: fulfillment,
        createdAtSource: createdAt,
        cancelledAtSource: cancelled
          ? new Date(createdAt.getTime() + 30 * 60 * 1000)
          : null,
        attributionChannel: channel,
        rawShopify,
        attribution,
        lineItems,
      });
    }
  }

  return out;
};
