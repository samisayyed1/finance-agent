/**
 * Async iterator over Shopify Admin REST `orders.json` pages with leaky-bucket
 * rate-limit awareness via `X-Shopify-Shop-Api-Call-Limit` (format
 * `{used}/{available}`). When usage > 35/40, sleep before the next call.
 *
 * Each yielded page is a raw event { topic: 'backfill.order', payload: order }
 * — same shape as a webhook so the normalize job is fed identically by both
 * paths (Iron Rule #4: raw payloads in R2, normalized rebuildable from raw).
 */

const SHOPIFY_API_VERSION = "2025-10";
const PAGE_SIZE = 250;

export interface BackfillCallEnv {
  accessToken: string;
  fetchImpl?: typeof fetch;
  shop: string;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface RawBackfillEvent {
  payload: unknown;
  topic: "backfill.order";
}

const sleepDefault = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseCallLimit = (
  header: string | null
): { used: number; cap: number } => {
  if (!header) {
    return { used: 0, cap: 40 };
  }
  const [usedStr, capStr] = header.split("/");
  return {
    used: Number(usedStr) || 0,
    cap: Number(capStr) || 40,
  };
};

export const backfillOrders = async function* (
  args: {
    since: Date;
  } & BackfillCallEnv
): AsyncIterable<RawBackfillEvent> {
  const {
    shop,
    accessToken,
    since,
    fetchImpl = fetch,
    sleepImpl = sleepDefault,
  } = args;
  let url: string | null =
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=${PAGE_SIZE}&updated_at_min=${since.toISOString()}&order=created_at+asc`;

  while (url) {
    const res = await fetchImpl(url, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "2");
      await sleepImpl(Math.max(retryAfter, 1) * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `shopify backfill: ${res.status} ${res.statusText} for ${url}`
      );
    }
    const limit = parseCallLimit(
      res.headers.get("X-Shopify-Shop-Api-Call-Limit")
    );
    if (limit.used > Math.floor(limit.cap * 0.875)) {
      await sleepImpl(500);
    }
    const body = (await res.json()) as { orders: unknown[] };
    for (const order of body.orders) {
      yield { topic: "backfill.order", payload: order };
    }
    const link = res.headers.get("link") ?? res.headers.get("Link");
    url = nextLinkUrl(link);
  }
};

const NEXT_LINK_RE = /<([^>]+)>;\s*rel="next"/;

const nextLinkUrl = (link: string | null): string | null => {
  if (!link) {
    return null;
  }
  const match = NEXT_LINK_RE.exec(link);
  return match?.[1] ?? null;
};
