/**
 * "Maeve Co." — typed Scenario for the Day-8 demo seed. Validated by Zod
 * so a corrupted scenario can never silently produce a broken dataset.
 *
 * The shape is generic-on-purpose (Iron Rule #10): nothing here is
 * ecommerce-specific other than the SKU pool. A SaaS or B2B variant slots
 * in by swapping the scenario constant; the synthesis pipeline doesn't change.
 */
import { z } from "zod";

const channelEnum = z.enum(["meta", "google", "klaviyo", "organic", "other"]);

export const anomalyKindEnum = z.enum([
  "META_ATTRIBUTION_DRIFT",
  "META_ROAS_COLLAPSE",
  "REFUND_SPIKE",
  "NEW_CUSTOMER_SURGE",
  "STRIPE_PAYOUT_GAP",
  "ORDER_MISSING_PAYMENT",
]);

const anomalyDef = z
  .object({
    kind: anomalyKindEnum,
    /** Day offsets relative to "today" (the seed run date). Negative.    */
    daysAgoStart: z.number().int().nonpositive(),
    daysAgoEnd: z.number().int().nonpositive(),
    /** Free-form bag of magnitudes used by each anomaly's synthesizer.   */
    params: z.record(z.string(), z.number()),
  })
  .refine((a) => a.daysAgoEnd <= a.daysAgoStart, {
    message: "daysAgoEnd must be ≤ daysAgoStart (further past first)",
  });

const skuItem = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  /** Unit price in cents (minor units). All money in cents.            */
  unitPriceMinor: z.number().int().positive(),
  category: z.string().min(1),
});

export const scenarioSchema = z.object({
  orgName: z.string().min(1),
  orgSlug: z.string().min(1),
  timezone: z.string().min(1),
  currency: z.string().length(3),

  /** Base daily revenue in MAJOR units (USD). Source of truth for sizing. */
  baseRevenuePerDayUsd: z.number().positive(),
  /** Day-of-week multipliers; 0=Sunday … 6=Saturday.                       */
  dowMultipliers: z.record(
    z.union([
      z.literal("0"),
      z.literal("1"),
      z.literal("2"),
      z.literal("3"),
      z.literal("4"),
      z.literal("5"),
      z.literal("6"),
    ]),
    z.number().positive()
  ),

  baseOrdersPerDay: z.number().int().positive(),
  aovUsdMin: z.number().positive(),
  aovUsdMax: z.number().positive(),
  baseRefundRate: z.number().min(0).max(1),

  paidShare: z.number().min(0).max(1),
  paidSplit: z.object({
    meta: z.number().min(0).max(1),
    google: z.number().min(0).max(1),
  }),
  attribution: z.object({
    meta: z.number().min(0).max(1),
    google: z.number().min(0).max(1),
    organic: z.number().min(0).max(1),
    klaviyo: z.number().min(0).max(1),
    other: z.number().min(0).max(1),
  }),

  baselineMetaRoas: z.number().positive(),
  baselineGoogleRoas: z.number().positive(),

  anomalies: z.array(anomalyDef),
  skuPool: z.array(skuItem).min(3),
  customerPoolSize: z.number().int().positive(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type AnomalyDef = z.infer<typeof anomalyDef>;
export type AnomalyKind = z.infer<typeof anomalyKindEnum>;
export type Channel = z.infer<typeof channelEnum>;

const MAEVE: Scenario = {
  orgName: "Maeve Co.",
  orgSlug: "demo-shopify-brand",
  timezone: "America/New_York",
  currency: "USD",

  baseRevenuePerDayUsd: 8200,
  dowMultipliers: {
    "0": 0.6,
    "1": 0.95,
    "2": 1.2,
    "3": 1.05,
    "4": 1.4,
    "5": 0.9,
    "6": 0.85,
  },

  /** Calibrated so `baseOrdersPerDay × E[orderTotal] ≈ baseRevenuePerDayUsd`.
   *  E[orderTotal] ≈ 2 items × 1.5 qty × $71.60 avg SKU × 1.07 tax + ~$6 shipping ≈ $236. */
  baseOrdersPerDay: 35,
  aovUsdMin: 45,
  aovUsdMax: 165,
  baseRefundRate: 0.022,

  paidShare: 0.65,
  paidSplit: { meta: 0.62, google: 0.38 },
  attribution: {
    meta: 0.4,
    google: 0.25,
    organic: 0.3,
    klaviyo: 0.04,
    other: 0.01,
  },

  baselineMetaRoas: 4.1,
  baselineGoogleRoas: 6.8,

  anomalies: [
    {
      kind: "META_ATTRIBUTION_DRIFT",
      daysAgoStart: -75,
      daysAgoEnd: -80,
      params: { overReportFactor: 1.3 },
    },
    {
      kind: "META_ROAS_COLLAPSE",
      daysAgoStart: -55,
      daysAgoEnd: -62,
      params: { startRoas: 4.1, endRoas: 1.8 },
    },
    {
      kind: "REFUND_SPIKE",
      daysAgoStart: -45,
      daysAgoEnd: -47,
      params: { multiplier: 6 },
    },
    {
      kind: "NEW_CUSTOMER_SURGE",
      daysAgoStart: -30,
      daysAgoEnd: -30,
      params: { orderMultiplier: 3 },
    },
    {
      kind: "STRIPE_PAYOUT_GAP",
      daysAgoStart: -10,
      daysAgoEnd: -17,
      params: { delayDays: 3 },
    },
    {
      kind: "ORDER_MISSING_PAYMENT",
      daysAgoStart: 0,
      daysAgoEnd: -7,
      params: { orderCount: 8 },
    },
  ],

  skuPool: [
    {
      sku: "MAE-CAN-01",
      title: "Birch Pillar Candle (Set of 3)",
      unitPriceMinor: 4800,
      category: "candles",
    },
    {
      sku: "MAE-CAN-02",
      title: "Lavender Linen Spray",
      unitPriceMinor: 2600,
      category: "home-fragrance",
    },
    {
      sku: "MAE-LIN-01",
      title: "Stonewashed Linen Throw",
      unitPriceMinor: 12_400,
      category: "textiles",
    },
    {
      sku: "MAE-LIN-02",
      title: "Heavyweight Linen Sheet Set (Queen)",
      unitPriceMinor: 16_500,
      category: "textiles",
    },
    {
      sku: "MAE-CER-01",
      title: "Hand-Thrown Stoneware Mug",
      unitPriceMinor: 3800,
      category: "ceramics",
    },
    {
      sku: "MAE-CER-02",
      title: "Stoneware Dinner Plate (Set of 4)",
      unitPriceMinor: 9200,
      category: "ceramics",
    },
    {
      sku: "MAE-WOOD-01",
      title: "Walnut Cutting Board",
      unitPriceMinor: 7400,
      category: "kitchen",
    },
    {
      sku: "MAE-WOOD-02",
      title: "Acacia Salad Bowl",
      unitPriceMinor: 5600,
      category: "kitchen",
    },
    {
      sku: "MAE-BATH-01",
      title: "Turkish Cotton Bath Towel (Set of 2)",
      unitPriceMinor: 6900,
      category: "bath",
    },
    {
      sku: "MAE-BATH-02",
      title: "Eucalyptus Bath Salts",
      unitPriceMinor: 2400,
      category: "bath",
    },
  ],
  customerPoolSize: 2500,
};

export const maeveScenario: Scenario = scenarioSchema.parse(MAEVE);
