/**
 * Universal connector interface. Every external data source (Shopify, Stripe,
 * Meta, Google, QuickBooks, Xero, NetSuite, Plaid, …) implements this exact
 * shape so adding a new vertical is structural, not a rewrite.
 *
 * - `RawEvent` is the source's native event payload (whatever they push at us).
 * - `Normalized` is our internal representation per source — events are
 *   reduced to a small set of canonical kinds (order, refund, payment, ad_spend, …).
 *
 * Iron rule echo: the LLM never reads `RawEvent` directly. It reads
 * `Normalized` rows from the truth layer, which were produced by
 * `parseEvent()`. Raw payloads are kept in R2, immutable.
 */
export interface Connector<RawEvent, Normalized> {
  backfill(orgId: string, since: Date): AsyncIterable<RawEvent>;

  oauth: {
    authorizeUrl(orgId: string, state?: string): string;
    exchangeCode(args: { code: string; orgId: string }): Promise<{
      accessToken: string;
      refreshToken?: string;
      scopes: string[];
    }>;
  };

  parseEvent(raw: RawEvent): Normalized[];

  reconcile(
    orgId: string,
    window: { from: Date; to: Date }
  ): Promise<ReconciliationDelta>;
  readonly source:
    | "shopify"
    | "stripe"
    | "meta"
    | "google"
    | "quickbooks"
    | "xero"
    | "netsuite"
    | "plaid";

  verifyWebhook(args: {
    headers: Record<string, string>;
    rawBody: string;
  }): boolean;

  readonly webhookTopics: readonly string[];
}

export interface ReconciliationDelta {
  flagsByKind: Record<string, number>;
  flagsCreated: number;
  flagsResolved: number;
  source: Connector<unknown, unknown>["source"];
  window: { from: Date; to: Date };
}
