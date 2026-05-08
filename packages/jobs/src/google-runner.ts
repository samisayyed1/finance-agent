/**
 * google-ads-api SDK adapter that yields raw GAQL rows for the connector
 * parser. Lives in jobs/ because that's where the SDK runtime dep belongs
 * (the connector package stays SDK-light so its parse + types don't drag
 * in the entire google-ads-api binary cost into other packages).
 */

import { GoogleAdsApi } from "google-ads-api";

export interface GoogleAdsRunnerArgs {
  clientId: string;
  clientSecret: string;
  customerId: string;
  developerToken: string;
  gaql: string;
  loginCustomerId?: string;
  refreshToken: string;
}

export async function* runGAQL(
  args: GoogleAdsRunnerArgs
): AsyncIterable<unknown> {
  const client = new GoogleAdsApi({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    developer_token: args.developerToken,
  });
  const customer = client.Customer({
    customer_id: args.customerId.replace(/-/g, ""),
    refresh_token: args.refreshToken,
    login_customer_id: args.loginCustomerId?.replace(/-/g, ""),
  });
  // The SDK returns a fully materialized array — no streaming. Day-5 is
  // OK to materialize since GAQL date-bounded queries top out under a few
  // thousand rows for the brand sizes we serve.
  const results = (await customer.query(args.gaql)) as unknown[];
  for (const row of results) {
    yield row;
  }
}
