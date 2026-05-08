import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMetaInsightRow, parseMetaInsightsResponse } from "../src/parse";

const FIX = join(import.meta.dirname, "..", "fixtures");
const load = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(FIX, name), "utf-8"));

describe("Meta parseMetaInsightRow", () => {
  it("campaign-typical: maps spend/impressions/clicks + sums purchase actions and values", async () => {
    const fix = (await load("insight-campaign-typical.json")) as {
      data: unknown[];
    };
    const [parsed] = parseMetaInsightsResponse(fix);
    expect(parsed.campaign.level).toBe("campaign");
    expect(parsed.campaign.sourceCampaignId).toBe("23857600412340000");
    expect(parsed.campaign.parentSourceCampaignId).toBeUndefined();
    expect(parsed.campaign.objective).toBe("OUTCOME_SALES");
    expect(parsed.metric.spend).toBe("312.47");
    expect(parsed.metric.impressions).toBe(84_512);
    expect(parsed.metric.clicks).toBe(1248);
    // 18 (purchase) + 18 (offsite_conversion.fb_pixel_purchase) — both
    // are purchase action types in the parser, so the sum is 36.
    // Operators sometimes find this surprising; the canonical approach
    // matches Meta's own deduped reporting via `purchase_roas`.
    expect(parsed.metric.conversions).toBe(36);
    // Same for value: 1487.50 + 1487.50 = 2975.00
    expect(parsed.metric.conversionValue).toBe("2975.00");
    expect(parsed.metric.currency).toBe("USD");
    expect(parsed.metric.roasSource).toBe("4.7604");
  });

  it("campaign-zero-spend: parses paused day with no actions", async () => {
    const fix = (await load("insight-campaign-zero-spend.json")) as {
      data: unknown[];
    };
    const [parsed] = parseMetaInsightsResponse(fix);
    expect(parsed.metric.spend).toBe("0.00");
    expect(parsed.metric.impressions).toBe(0);
    expect(parsed.metric.clicks).toBe(0);
    expect(parsed.metric.conversions).toBe(0);
    expect(parsed.metric.conversionValue).toBe("0");
    expect(parsed.metric.roasSource).toBeUndefined();
  });

  it("adset-conversions: ad_set level + parent campaign id + 7d attribution preserved", async () => {
    const fix = (await load("insight-adset-conversions.json")) as {
      data: unknown[];
    };
    const [parsed] = parseMetaInsightsResponse(fix);
    expect(parsed.campaign.level).toBe("ad_set");
    expect(parsed.campaign.sourceCampaignId).toBe("23857600412350000");
    expect(parsed.campaign.parentSourceCampaignId).toBe("23857600412340000");
    expect(parsed.metric.spend).toBe("127.83");
    expect(parsed.metric.conversions).toBe(18);
    expect(parsed.metric.conversionValue).toBe("1484.32");
  });

  it("ad-creative: ad level + parent ad-set id, ignores video_view as non-purchase", async () => {
    const fix = (await load("insight-ad-creative.json")) as {
      data: unknown[];
    };
    const [parsed] = parseMetaInsightsResponse(fix);
    expect(parsed.campaign.level).toBe("ad");
    expect(parsed.campaign.sourceCampaignId).toBe("23857600412360000");
    expect(parsed.campaign.parentSourceCampaignId).toBe("23857600412350000");
    expect(parsed.campaign.name).toBe("UGC – Sarah testimonial 30s");
    expect(parsed.metric.spend).toBe("42.91");
    // Only `purchase` is summed; video_view is ignored.
    expect(parsed.metric.conversions).toBe(3);
    expect(parsed.metric.conversionValue).toBe("248.97");
  });

  it("rejects malformed payload (missing required fields)", () => {
    expect(() => parseMetaInsightRow({ campaign_id: "x" })).toThrow();
  });
});
