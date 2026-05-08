import { describe, expect, it } from "vitest";
import {
  extractOrderAttribution,
  inferMarketingSource,
} from "../src/parse/attribution";

describe("inferMarketingSource", () => {
  it("utm_source=facebook → meta", () => {
    expect(
      inferMarketingSource({
        utm_source: "facebook",
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("meta");
  });

  it("utm_source=fb (uppercase F too) → meta", () => {
    expect(
      inferMarketingSource({
        utm_source: "FB",
        utm_medium: "paid",
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("meta");
  });

  it("utm_source=meta → meta", () => {
    expect(
      inferMarketingSource({
        utm_source: "meta",
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("meta");
  });

  it("utm_source=instagram → meta", () => {
    expect(
      inferMarketingSource({
        utm_source: "instagram",
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("meta");
  });

  it("utm_source=google + utm_medium=cpc → google", () => {
    expect(
      inferMarketingSource({
        utm_source: "google",
        utm_medium: "cpc",
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("google");
  });

  it("utm_source=tiktok → tiktok", () => {
    expect(
      inferMarketingSource({
        utm_source: "tiktok",
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("tiktok");
  });

  it("utm_source=klaviyo OR utm_medium=email → klaviyo", () => {
    expect(
      inferMarketingSource({
        utm_source: null,
        utm_medium: "email",
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("klaviyo");
    expect(
      inferMarketingSource({
        utm_source: "klaviyo",
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("klaviyo");
  });

  it("no UTM + no referring host → organic", () => {
    expect(
      inferMarketingSource({
        utm_source: null,
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("organic");
  });

  it("referring_host=m.facebook.com (no UTM) → meta", () => {
    expect(
      inferMarketingSource({
        utm_source: null,
        utm_medium: null,
        referring_host: "m.facebook.com",
        shopify_source_name: null,
      })
    ).toBe("meta");
  });

  it("Shopify source_name=fb_pixel → meta", () => {
    expect(
      inferMarketingSource({
        utm_source: null,
        utm_medium: null,
        referring_host: null,
        shopify_source_name: "fb_pixel",
      })
    ).toBe("meta");
  });

  it("ambiguous (utm_source=newsletter, no medium hint) → other", () => {
    expect(
      inferMarketingSource({
        utm_source: "newsletter",
        utm_medium: null,
        referring_host: null,
        shopify_source_name: null,
      })
    ).toBe("other");
  });
});

describe("extractOrderAttribution", () => {
  it("parses UTM params from landing_site URL", () => {
    const out = extractOrderAttribution({
      landing_site:
        "/products/widget?utm_source=facebook&utm_medium=paid&utm_campaign=spring",
      referring_site: "https://m.facebook.com/",
      source_name: "web",
    });
    expect(out.utm_source).toBe("facebook");
    expect(out.utm_medium).toBe("paid");
    expect(out.utm_campaign).toBe("spring");
    expect(out.referring_host).toBe("m.facebook.com");
    expect(out.inferred_marketing_source).toBe("meta");
  });

  it("URL-decodes UTM values", () => {
    const out = extractOrderAttribution({
      landing_site: "/?utm_source=google&utm_medium=cpc&utm_term=hello%20world",
      referring_site: null,
      source_name: null,
    });
    expect(out.utm_term).toBe("hello world");
    expect(out.inferred_marketing_source).toBe("google");
  });

  it("null inputs → all-null attribution + organic inference", () => {
    const out = extractOrderAttribution({
      landing_site: null,
      referring_site: null,
      source_name: null,
    });
    expect(out.utm_source).toBeNull();
    expect(out.referring_host).toBeNull();
    expect(out.inferred_marketing_source).toBe("organic");
  });
});
