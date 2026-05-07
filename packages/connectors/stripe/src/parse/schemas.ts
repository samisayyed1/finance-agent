import { z } from "zod";

/** Stripe transmits money as integer minor units. We accept number; bigints
 *  aren't a concern at Stripe scale. */
const minor = z.number().int();

const balanceTransactionSchema = z
  .object({
    id: z.string(),
    fee: minor,
    net: minor,
  })
  .passthrough();

export const stripeChargeSchema = z
  .object({
    id: z.string(),
    object: z.literal("charge"),
    amount: minor,
    amount_refunded: minor.default(0),
    currency: z.string(),
    status: z.string(),
    paid: z.boolean().optional(),
    captured: z.boolean().optional(),
    created: z.number().int(),
    /** Either the id (string) or the expanded object. */
    balance_transaction: z
      .union([z.string(), balanceTransactionSchema])
      .nullable()
      .optional(),
    metadata: z.record(z.string(), z.string()).default({}),
    refunds: z
      .object({
        data: z.array(
          z
            .object({
              id: z.string(),
              amount: minor,
              currency: z.string(),
              reason: z.string().nullable().optional(),
              created: z.number().int(),
              charge: z.union([z.string(), z.object({}).passthrough()]),
              status: z.string().optional(),
            })
            .passthrough()
        ),
      })
      .optional(),
  })
  .passthrough();
export type StripeCharge = z.infer<typeof stripeChargeSchema>;

export const stripeRefundSchema = z
  .object({
    id: z.string(),
    object: z.literal("refund"),
    amount: minor,
    currency: z.string(),
    charge: z.union([z.string(), z.object({}).passthrough()]),
    reason: z.string().nullable().optional(),
    status: z.string().optional(),
    created: z.number().int(),
    metadata: z.record(z.string(), z.string()).default({}),
  })
  .passthrough();
export type StripeRefund = z.infer<typeof stripeRefundSchema>;

export const stripePayoutSchema = z
  .object({
    id: z.string(),
    object: z.literal("payout"),
    amount: minor,
    currency: z.string(),
    status: z.string(),
    arrival_date: z.number().int().nullable().optional(),
    created: z.number().int(),
    failure_message: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.string()).default({}),
  })
  .passthrough();
export type StripePayout = z.infer<typeof stripePayoutSchema>;

export const stripeDisputeSchema = z
  .object({
    id: z.string(),
    object: z.literal("dispute"),
    amount: minor,
    currency: z.string(),
    charge: z.union([z.string(), z.object({}).passthrough()]),
    status: z.string(),
    created: z.number().int(),
  })
  .passthrough();
export type StripeDispute = z.infer<typeof stripeDisputeSchema>;

export const stripeEventSchema = z
  .object({
    id: z.string(),
    object: z.literal("event"),
    type: z.string(),
    api_version: z.string().optional(),
    livemode: z.boolean(),
    created: z.number().int(),
    account: z.string().optional(),
    data: z.object({ object: z.unknown() }).passthrough(),
  })
  .passthrough();
export type StripeEvent = z.infer<typeof stripeEventSchema>;
