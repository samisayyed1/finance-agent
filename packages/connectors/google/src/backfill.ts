/**
 * Google Ads backfill iterator.
 *
 * Day-5 ships the GAQL query string + a parser for whatever rows arrive.
 * The actual query execution uses google-ads-api at runtime, which the
 * Trigger.dev job wires up. The iterator below accepts a pluggable
 * `runner` so tests don't need a live connection.
 */

import type { ParsedGAQLRow } from "./canonical/types";
import { parseGoogleAdsRow } from "./parse";

export const buildBackfillGAQL = (since: string, until: string): string => {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.average_cpc,
      metrics.ctr,
      customer.currency_code,
      customer.id
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `.trim();
};

export interface GoogleAdsBackfillArgs {
  clientId: string;
  clientSecret: string;
  customerId: string;
  developerToken: string;
  /** Login customer id when using a manager (MCC) account. */
  loginCustomerId?: string;
  refreshToken: string;
  /** Pluggable GAQL runner. Production: google-ads-api. Tests: yields a
   *  recorded fixture array. */
  runner?: (args: {
    customerId: string;
    loginCustomerId?: string;
    refreshToken: string;
    developerToken: string;
    clientId: string;
    clientSecret: string;
    gaql: string;
  }) => AsyncIterable<unknown>;
  since: string;
  until?: string;
}

const isoToday = (): string => new Date().toISOString().slice(0, 10);

export async function* backfillGoogleAdsInsights(
  args: GoogleAdsBackfillArgs
): AsyncIterable<ParsedGAQLRow> {
  if (!args.runner) {
    throw new Error(
      "backfillGoogleAdsInsights: a `runner` must be provided. Day-5 wiring uses google-ads-api in apps/jobs."
    );
  }
  const gaql = buildBackfillGAQL(args.since, args.until ?? isoToday());
  for await (const raw of args.runner({
    customerId: args.customerId,
    loginCustomerId: args.loginCustomerId,
    refreshToken: args.refreshToken,
    developerToken: args.developerToken,
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    gaql,
  })) {
    yield parseGoogleAdsRow(raw);
  }
}
