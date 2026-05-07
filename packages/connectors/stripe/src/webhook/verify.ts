import Stripe from "stripe";
import type { StripeEvent } from "../parse/schemas";

/**
 * Stripe webhook signature verification. The Stripe SDK's
 * `webhooks.constructEventAsync` does HMAC SHA-256 + timestamp tolerance
 * (5 minutes by default) — replay protection comes for free.
 *
 * The signature scheme is the same on Connect and on the platform account;
 * which secret to pass depends on which endpoint received the call.
 */

let cached: Stripe | null = null;

const getStripe = (apiKey: string): Stripe => {
  if (cached) {
    return cached;
  }
  cached = new Stripe(apiKey, { typescript: true });
  return cached;
};

export interface VerifyArgs {
  apiKey: string;
  endpointSecret: string;
  rawBody: string | Uint8Array;
  signatureHeader: string;
}

export const verifyStripeWebhook = async (
  args: VerifyArgs
): Promise<StripeEvent> => {
  const stripe = getStripe(args.apiKey);
  const body =
    typeof args.rawBody === "string"
      ? args.rawBody
      : new TextDecoder().decode(args.rawBody);
  const event = await stripe.webhooks.constructEventAsync(
    body,
    args.signatureHeader,
    args.endpointSecret
  );
  return event as unknown as StripeEvent;
};
