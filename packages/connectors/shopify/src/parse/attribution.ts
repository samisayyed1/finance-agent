/**
 * Day-6: extract marketing-source attribution from a Shopify order
 * payload. Pure function — no I/O. Produces a typed `attribution`
 * sub-object that lands in `orders.source_metadata.attribution` so the
 * reconcile package can compare ad-platform-reported conversions against
 * UTM-attributed orders without re-parsing rawPayload.
 */

const URL_PARAM_RE = /([?&])([^=&#]+)=([^&#]*)/g;
const HOSTNAME_RE = /^https?:\/\/([^/?#]+)/i;

export type InferredMarketingSource =
  | "meta"
  | "google"
  | "tiktok"
  | "klaviyo"
  | "organic"
  | "other";

export interface OrderAttribution {
  inferred_marketing_source: InferredMarketingSource;
  referring_host: string | null;
  shopify_source_name: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_medium: string | null;
  utm_source: string | null;
  utm_term: string | null;
}

const META_UTM_SOURCES = new Set(["facebook", "fb", "meta", "instagram", "ig"]);
const META_PIXEL_SOURCE_NAMES = new Set(["fb_pixel", "facebook", "meta"]);
const GOOGLE_PAID_MEDIUMS = new Set(["cpc", "ppc", "paid"]);

const lc = (s: string | null): string | null =>
  s === null ? null : s.toLowerCase().trim();

const parseUrlParam = (url: string | null, name: string): string | null => {
  if (!url) {
    return null;
  }
  for (const m of url.matchAll(URL_PARAM_RE)) {
    if (m[2]?.toLowerCase() === name) {
      const v = m[3] ?? "";
      try {
        return decodeURIComponent(v) || null;
      } catch {
        return v || null;
      }
    }
  }
  return null;
};

const parseReferringHost = (referring: string | null): string | null => {
  if (!referring) {
    return null;
  }
  const m = HOSTNAME_RE.exec(referring);
  return m?.[1]?.toLowerCase() ?? null;
};

export const inferMarketingSource = (
  attribution: Pick<
    OrderAttribution,
    "utm_source" | "utm_medium" | "referring_host" | "shopify_source_name"
  >
): InferredMarketingSource => {
  const src = lc(attribution.utm_source);
  const med = lc(attribution.utm_medium);
  const host = lc(attribution.referring_host);
  const sname = lc(attribution.shopify_source_name);

  // Meta: any of the recognized UTM sources, the FB pixel source_name,
  // or a referring_host on a facebook/instagram subdomain.
  if (
    (src && META_UTM_SOURCES.has(src)) ||
    (sname && META_PIXEL_SOURCE_NAMES.has(sname)) ||
    (host && (host.includes("facebook.") || host.includes("instagram.")))
  ) {
    return "meta";
  }

  // Google: utm_source=google AND a paid-medium qualifier (cpc/ppc/paid).
  // Without paid medium it's ambiguous (could be organic search).
  if (
    (src === "google" || src === "adwords") &&
    med &&
    GOOGLE_PAID_MEDIUMS.has(med)
  ) {
    return "google";
  }

  if (src === "tiktok" || host?.includes("tiktok.")) {
    return "tiktok";
  }

  if (src === "klaviyo" || med === "email") {
    return "klaviyo";
  }

  if (!(src || host)) {
    return "organic";
  }

  return "other";
};

export interface RawShopifyOrderForAttribution {
  landing_site?: string | null;
  referring_site?: string | null;
  source_name?: string | null;
}

export const extractOrderAttribution = (
  raw: RawShopifyOrderForAttribution
): OrderAttribution => {
  const landing = raw.landing_site ?? null;
  const utm_source = parseUrlParam(landing, "utm_source");
  const utm_medium = parseUrlParam(landing, "utm_medium");
  const utm_campaign = parseUrlParam(landing, "utm_campaign");
  const utm_content = parseUrlParam(landing, "utm_content");
  const utm_term = parseUrlParam(landing, "utm_term");
  const referring_host = parseReferringHost(raw.referring_site ?? null);
  const shopify_source_name = raw.source_name ?? null;

  const inferred_marketing_source = inferMarketingSource({
    utm_source,
    utm_medium,
    referring_host,
    shopify_source_name,
  });

  return {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    referring_host,
    shopify_source_name,
    inferred_marketing_source,
  };
};
