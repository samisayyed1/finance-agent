/**
 * Meta Insights backfill iterator.
 *
 * Three passes — campaign → ad_set → ad — for full granularity.
 * Cursor pagination via `paging.cursors.after`.
 *
 * Rate-limit awareness (X-Business-Use-Case-Usage header): when call_count
 * is > 80 of 100, sleep until the header reports a fresh window. Day-5
 * implementation backs off 60s on >80% utilization; Day-6+ can read the
 * estimated_time_to_regain_access field.
 */

import type { ParsedInsight } from "./canonical/types";
import { META_API_VERSION, type MetaFetcher } from "./oauth";
import { parseMetaInsightsResponse } from "./parse";

export interface MetaBackfillArgs {
  accessToken: string;
  /** "act_<numeric>" — Meta's `me/adaccounts.id` shape. */
  adAccountId: string;
  fetcher?: MetaFetcher;
  /** ISO YYYY-MM-DD */
  since: string;
  /** Optional sleeper for tests so we don't actually wait 60s. */
  sleeper?: (ms: number) => Promise<void>;
  /** ISO YYYY-MM-DD; default = today (UTC). */
  until?: string;
}

const RATE_LIMIT_THRESHOLD_PCT = 80;
const RATE_LIMIT_BACKOFF_MS = 60_000;

const checkRateLimit = (header: string | null): number | null => {
  if (!header) {
    return null;
  }
  try {
    const parsed = JSON.parse(header) as Record<
      string,
      { call_count?: number; total_time?: number; total_cputime?: number }[]
    >;
    let highest = 0;
    for (const usages of Object.values(parsed)) {
      for (const u of usages) {
        const c = u.call_count ?? 0;
        if (c > highest) {
          highest = c;
        }
      }
    }
    return highest;
  } catch {
    return null;
  }
};

const isoToday = (): string => new Date().toISOString().slice(0, 10);

interface InsightsFetchResult {
  nextCursor?: string;
  parsed: ParsedInsight[];
}

const fetchInsightsPage = async (args: {
  adAccountId: string;
  accessToken: string;
  fetcher: MetaFetcher;
  level: "campaign" | "adset" | "ad";
  since: string;
  until: string;
  cursor?: string;
}): Promise<InsightsFetchResult & { rateLimitPct: number | null }> => {
  const fields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "objective",
    "account_currency",
    "account_id",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "actions",
    "action_values",
    "purchase_roas",
  ].join(",");
  const params = new URLSearchParams({
    access_token: args.accessToken,
    level: args.level,
    fields,
    time_increment: "1",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    limit: "500",
  });
  if (args.cursor) {
    params.set("after", args.cursor);
  }
  const url = `https://graph.facebook.com/${META_API_VERSION}/${args.adAccountId}/insights?${params.toString()}`;
  const res = await args.fetcher(url, { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `meta insights: ${res.status} ${res.statusText} ${body.slice(0, 500)}`
    );
  }
  const json = (await res.json()) as {
    paging?: { cursors?: { after?: string }; next?: string };
    data: unknown[];
  };
  const rateLimitPct = checkRateLimit(
    res.headers.get("x-business-use-case-usage")
  );
  const parsed = parseMetaInsightsResponse(json);
  return {
    parsed,
    nextCursor: json.paging?.next ? json.paging?.cursors?.after : undefined,
    rateLimitPct,
  };
};

export async function* backfillMetaInsights(
  args: MetaBackfillArgs
): AsyncIterable<ParsedInsight> {
  const fetcher =
    args.fetcher ?? (globalThis.fetch.bind(globalThis) as MetaFetcher);
  const sleeper =
    args.sleeper ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const until = args.until ?? isoToday();

  for (const level of ["campaign", "adset", "ad"] as const) {
    let cursor: string | undefined;
    do {
      const result = await fetchInsightsPage({
        adAccountId: args.adAccountId,
        accessToken: args.accessToken,
        fetcher,
        level,
        since: args.since,
        until,
        cursor,
      });
      for (const p of result.parsed) {
        yield p;
      }
      if (
        result.rateLimitPct !== null &&
        result.rateLimitPct > RATE_LIMIT_THRESHOLD_PCT
      ) {
        await sleeper(RATE_LIMIT_BACKOFF_MS);
      }
      cursor = result.nextCursor;
    } while (cursor);
  }
}
