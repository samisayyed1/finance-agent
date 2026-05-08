/**
 * Meta Marketing Insights API Zod schemas.
 *
 * Source: https://developers.facebook.com/docs/marketing-api/insights/parameters
 *
 * Insights returns spend/impressions/clicks/etc. as STRINGS (Meta encodes
 * numerics as strings to avoid JS-precision loss). We keep them as strings
 * end-to-end for cents-exactness; conversion to Dinero happens in
 * @ai-cfo/metrics, never here.
 *
 * `actions` is an array of {action_type, value} where action_type names
 * the conversion event ("offsite_conversion.fb_pixel_purchase",
 * "purchase", etc.). We sum across well-known purchase types when
 * computing `conversions`.
 */

import { z } from "zod";

const numericString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected numeric string from Meta");

const optionalNumericString = numericString.optional();

export const MetaInsightActionSchema = z.object({
  action_type: z.string(),
  value: numericString,
  /** Attribution windows present when query specified action_attribution_windows. */
  "1d_click": numericString.optional(),
  "7d_click": numericString.optional(),
  "1d_view": numericString.optional(),
  "28d_click": numericString.optional(),
});
export type MetaInsightAction = z.infer<typeof MetaInsightActionSchema>;

export const MetaInsightActionValueSchema = z.object({
  action_type: z.string(),
  value: numericString,
});

/**
 * One row of /insights output. The set of populated fields varies by
 * `level` parameter (campaign / adset / ad), so almost everything is
 * optional and the parser branches on what's present.
 */
export const MetaInsightRowSchema = z.object({
  account_currency: z.string(),
  account_id: z.string().optional(),
  account_name: z.string().optional(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_stop: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spend: numericString,
  impressions: numericString.optional(),
  clicks: numericString.optional(),
  ctr: optionalNumericString,
  cpc: optionalNumericString,
  cpp: optionalNumericString,
  reach: optionalNumericString,
  frequency: optionalNumericString,

  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  adset_id: z.string().optional(),
  adset_name: z.string().optional(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  objective: z.string().optional(),

  actions: z.array(MetaInsightActionSchema).optional(),
  action_values: z.array(MetaInsightActionValueSchema).optional(),
  purchase_roas: z.array(MetaInsightActionValueSchema).optional(),
});
export type MetaInsightRow = z.infer<typeof MetaInsightRowSchema>;

export const MetaInsightsResponseSchema = z.object({
  data: z.array(MetaInsightRowSchema),
  paging: z
    .object({
      cursors: z
        .object({ before: z.string().optional(), after: z.string().optional() })
        .optional(),
      next: z.string().optional(),
      previous: z.string().optional(),
    })
    .optional(),
});
export type MetaInsightsResponse = z.infer<typeof MetaInsightsResponseSchema>;
