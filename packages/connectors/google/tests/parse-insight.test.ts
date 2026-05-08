import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGoogleAdsResponse, parseGoogleAdsRow } from "../src/parse";

const FIX = join(import.meta.dirname, "..", "fixtures");
const load = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(FIX, name), "utf-8"));

describe("Google Ads parseGoogleAdsRow", () => {
  it("typical search campaign: cost_micros 287430000 → '287.43', currency preserved", async () => {
    const fix = (await load("ads-campaign-typical.json")) as {
      results: unknown[];
    };
    const [parsed] = parseGoogleAdsResponse(fix);
    expect(parsed.campaign.sourceCampaignId).toBe("21034567890");
    expect(parsed.campaign.name).toBe("Search – Brand Terms");
    expect(parsed.campaign.status).toBe("active");
    expect(parsed.campaign.objective).toBe("SEARCH");
    expect(parsed.metric.spend).toBe("287.43");
    expect(parsed.metric.currency).toBe("USD");
    expect(parsed.metric.impressions).toBe(12_450);
    expect(parsed.metric.clicks).toBe(612);
    expect(parsed.metric.conversions).toBe(23.5);
    expect(parsed.metric.conversionValue).toBe("1842.36");
    expect(parsed.metric.cpc).toBe("0.47");
  });

  it("performance max: cost_micros 1234560000 → '1234.56', high-conv day", async () => {
    const fix = (await load("ads-campaign-converted.json")) as {
      results: unknown[];
    };
    const [parsed] = parseGoogleAdsResponse(fix);
    expect(parsed.metric.spend).toBe("1234.56");
    expect(parsed.metric.conversions).toBe(57);
    expect(parsed.metric.conversionValue).toBe("5421.18");
    expect(parsed.campaign.objective).toBe("PERFORMANCE_MAX");
  });

  it("shopping campaign: ctr preserved, conversion_value cent-exact", async () => {
    const fix = (await load("ads-shopping-campaign.json")) as {
      results: unknown[];
    };
    const [parsed] = parseGoogleAdsResponse(fix);
    expect(parsed.metric.spend).toBe("892.34");
    expect(parsed.metric.ctr).toBe("0.0190");
    expect(parsed.metric.conversionValue).toBe("3892.10");
    expect(parsed.campaign.objective).toBe("SHOPPING");
  });

  it("paused display: zero spend / zero impressions parses cleanly", async () => {
    const fix = (await load("ads-display-campaign.json")) as {
      results: unknown[];
    };
    const [parsed] = parseGoogleAdsResponse(fix);
    expect(parsed.metric.spend).toBe("0.00");
    expect(parsed.metric.impressions).toBe(0);
    expect(parsed.metric.clicks).toBe(0);
    expect(parsed.metric.conversions).toBe(0);
    expect(parsed.campaign.status).toBe("paused");
  });

  it("rejects malformed payload (missing required fields)", () => {
    expect(() => parseGoogleAdsRow({ campaign: { id: "x" } })).toThrow();
  });
});
