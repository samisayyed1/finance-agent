/**
 * Zod schemas for Google Ads GAQL response rows.
 *
 * GAQL returns nested objects {campaign: {...}, metrics: {...}, segments:
 * {...}, customer: {...}}. cost_micros / conversions_value are sometimes
 * returned as numbers (small) and sometimes strings (>2^53). We accept
 * either and normalize via costMicrosToDecimalString downstream.
 */

import { z } from "zod";

const numericLike = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]);

const ENUM_TO_STRING = z.union([z.string(), z.number()]);

export const GoogleAdsGAQLRowSchema = z.object({
  campaign: z.object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    status: ENUM_TO_STRING.optional(),
    advertising_channel_type: ENUM_TO_STRING.optional(),
  }),
  segments: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  metrics: z.object({
    cost_micros: numericLike,
    impressions: numericLike.optional(),
    clicks: numericLike.optional(),
    conversions: numericLike.optional(),
    conversions_value: numericLike.optional(),
    average_cpc: numericLike.optional(),
    ctr: numericLike.optional(),
  }),
  customer: z
    .object({
      currency_code: z.string(),
      id: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

export type GoogleAdsGAQLRow = z.infer<typeof GoogleAdsGAQLRowSchema>;

export const GoogleAdsGAQLResponseSchema = z.object({
  results: z.array(GoogleAdsGAQLRowSchema),
});
