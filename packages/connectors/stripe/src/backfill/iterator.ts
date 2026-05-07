import Stripe from "stripe";

/**
 * Backfill iterator over Stripe charges + payouts. Each yield is a synthetic
 * "raw event" that the downstream normalize job can parse via parseStripeEvent
 * after wrapping in event-shape (the backfill orchestrator does that wrap).
 *
 * Stripe SDK auto-pages with `for await`; we honor 429 by relying on the SDK's
 * built-in retry (default 0 retries; we set 3).
 */

const PAGE_SIZE = 100;

export interface BackfillCallEnv {
  apiKey: string;
  /** The connected account id ("acct_…") for Stripe Connect. */
  stripeAccountId: string;
}

export interface RawBackfillEvent {
  payload: Stripe.Charge | Stripe.Payout;
  topic: "charge.succeeded" | "payout.paid";
}

export const backfillCharges = async function* (
  args: { since: Date } & BackfillCallEnv
): AsyncIterable<RawBackfillEvent> {
  const stripe = new Stripe(args.apiKey, {
    typescript: true,
    maxNetworkRetries: 3,
    stripeAccount: args.stripeAccountId,
  });
  const since = Math.floor(args.since.getTime() / 1000);
  for await (const charge of stripe.charges.list({
    limit: PAGE_SIZE,
    created: { gte: since },
    expand: ["data.balance_transaction"],
  })) {
    yield { topic: "charge.succeeded", payload: charge };
  }
};

export const backfillPayouts = async function* (
  args: { since: Date } & BackfillCallEnv
): AsyncIterable<RawBackfillEvent> {
  const stripe = new Stripe(args.apiKey, {
    typescript: true,
    maxNetworkRetries: 3,
    stripeAccount: args.stripeAccountId,
  });
  const since = Math.floor(args.since.getTime() / 1000);
  for await (const payout of stripe.payouts.list({
    limit: PAGE_SIZE,
    created: { gte: since },
  })) {
    yield { topic: "payout.paid", payload: payout };
  }
};
