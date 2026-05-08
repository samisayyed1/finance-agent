/**
 * Pure URL builder for synthetic Shopify orders. Mirrors the UTM convention
 * brands actually use so `inferMarketingSource` (in connectors/shopify) maps
 * each landing_site back to the intended source.
 */

export type MarketingChannel =
  | "meta"
  | "google"
  | "klaviyo"
  | "organic"
  | "other";

export interface UtmParams {
  campaign?: string;
  channel: MarketingChannel;
  content?: string;
}

const STORE_URL = "https://maeve-co.myshopify.com/products/featured";

export const buildLandingSite = (params: UtmParams): string | null => {
  if (params.channel === "organic") {
    return null;
  }

  const u = new URL(STORE_URL);
  switch (params.channel) {
    case "meta":
      u.searchParams.set("utm_source", "facebook");
      u.searchParams.set("utm_medium", "paid");
      if (params.campaign) {
        u.searchParams.set("utm_campaign", params.campaign);
      }
      if (params.content) {
        u.searchParams.set("utm_content", params.content);
      }
      break;
    case "google":
      u.searchParams.set("utm_source", "google");
      u.searchParams.set("utm_medium", "cpc");
      if (params.campaign) {
        u.searchParams.set("utm_campaign", params.campaign);
      }
      break;
    case "klaviyo":
      u.searchParams.set("utm_source", "klaviyo");
      u.searchParams.set("utm_medium", "email");
      if (params.campaign) {
        u.searchParams.set("utm_campaign", params.campaign);
      }
      break;
    default:
      u.searchParams.set("utm_source", "referral");
      u.searchParams.set("utm_medium", "referral");
      break;
  }
  return u.toString();
};

export const buildReferringSite = (
  channel: MarketingChannel
): string | null => {
  switch (channel) {
    case "meta":
      return "https://l.facebook.com/";
    case "google":
      return "https://www.google.com/";
    case "other":
      return "https://t.co/";
    default:
      return null;
  }
};
