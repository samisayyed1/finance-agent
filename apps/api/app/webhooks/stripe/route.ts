import { verifyStripeWebhook } from "@ai-cfo/connector-stripe";
import { database, rawPayloads, sql } from "@ai-cfo/database";
import { logger } from "../../lib/logger";
import { putRawPayload } from "../../lib/r2";

/**
 * POST /webhooks/stripe
 *
 * Stripe Connect events arrive here. Order:
 *   1. Read raw body BEFORE parse.
 *   2. Verify stripe-signature → parse Stripe.Event.
 *   3. Resolve org_id from data_connections.source_metadata->>'stripe_account_id'
 *      = event.account.
 *   4. Insert raw_payloads (org_id, source='stripe', event_id=event.id) → idempotent.
 *   5. Upload raw body to R2 at `{orgId}/stripe/{YYYY}/{MM}/{DD}/{event.id}.json`.
 *   6. Enqueue Trigger.dev `ai-cfo.stripe-normalize`.
 *   7. Return 200.
 */

const resolveOrgIdForStripeAccount = async (
  stripeAccountId: string
): Promise<string | null> => {
  const result = await database.execute<{ org_id: string }>(
    sql`select org_id::text as org_id
        from public.data_connections
        where source = 'stripe'
          and source_metadata ->> 'stripe_account_id' = ${stripeAccountId}
        limit 1`
  );
  const rows = result as unknown as { org_id: string }[];
  return rows[0]?.org_id ?? null;
};

export const POST = async (req: Request): Promise<Response> => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    logger.warn("stripe webhook: missing stripe-signature");
    return new Response("missing signature", { status: 400 });
  }
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!(apiKey && endpointSecret)) {
    logger.error(
      "stripe webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set"
    );
    return new Response("server misconfigured", { status: 503 });
  }

  const rawBuf = new Uint8Array(await req.arrayBuffer());

  let event: Awaited<ReturnType<typeof verifyStripeWebhook>>;
  try {
    event = await verifyStripeWebhook({
      rawBody: rawBuf,
      signatureHeader: sig,
      endpointSecret,
      apiKey,
    });
  } catch (e) {
    logger.warn({ err: e }, "stripe webhook: signature verification failed");
    return new Response("invalid signature", { status: 400 });
  }

  // For Connect events, `event.account` is the connected acct_…; for platform
  // events (e.g. account-level), event.account is undefined → 410.
  const stripeAccountId = (event as unknown as { account?: string }).account;
  if (!stripeAccountId) {
    logger.info(
      { eventId: event.id, type: event.type },
      "stripe webhook: not a Connect event (no account)"
    );
    return new Response("ignored", { status: 200 });
  }

  const orgId = await resolveOrgIdForStripeAccount(stripeAccountId);
  if (!orgId) {
    logger.info(
      { stripeAccountId },
      "stripe webhook: no org for stripe account"
    );
    return new Response("gone", { status: 410 });
  }

  const r2Key = `${orgId}/stripe/${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "/")}/${event.id}.json`;

  const inserted = await database
    .insert(rawPayloads)
    .values({
      orgId,
      source: "stripe",
      eventId: event.id,
      topic: event.type,
      r2Key,
    })
    .onConflictDoNothing({
      target: [rawPayloads.orgId, rawPayloads.source, rawPayloads.eventId],
    })
    .returning({ id: rawPayloads.id });

  if (inserted.length === 0) {
    logger.info(
      { orgId, eventId: event.id },
      "stripe webhook: already processed (dedup)"
    );
    return new Response("ok", { status: 200 });
  }

  const row = inserted[0];
  if (!row) {
    return new Response("ok", { status: 200 });
  }

  try {
    await putRawPayload({
      orgId,
      source: "stripe",
      webhookId: event.id,
      body: rawBuf,
    });
  } catch (e) {
    logger.error(
      { err: e, orgId, eventId: event.id },
      "stripe webhook: R2 upload failed; row left for retry"
    );
    return new Response("ok", { status: 200 });
  }

  try {
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("ai-cfo.stripe-normalize", {
      orgId,
      rawPayloadId: row.id,
      eventType: event.type,
    });
  } catch (e) {
    logger.warn(
      { err: e, orgId, eventId: event.id },
      "stripe webhook: trigger.dev enqueue failed; backfill will catch up"
    );
  }

  return new Response("ok", { status: 200 });
};
