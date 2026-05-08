import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backfillMetaInsights } from "../src/backfill";

const FIX = join(import.meta.dirname, "..", "fixtures");

describe("Meta backfill iterator", () => {
  it("iterates campaign → adset → ad passes and respects pagination cursors", async () => {
    const campaign = JSON.parse(
      await readFile(join(FIX, "insight-campaign-typical.json"), "utf-8")
    ) as { data: unknown[]; paging?: unknown };
    const adset = JSON.parse(
      await readFile(join(FIX, "insight-adset-conversions.json"), "utf-8")
    ) as { data: unknown[] };
    const ad = JSON.parse(
      await readFile(join(FIX, "insight-ad-creative.json"), "utf-8")
    ) as { data: unknown[] };

    const calls: string[] = [];
    const fetcher: typeof fetch = (input) => {
      const url = String(input);
      calls.push(url);
      let body: { data: unknown[] };
      if (url.includes("level=campaign")) {
        body = { data: campaign.data };
      } else if (url.includes("level=adset")) {
        body = { data: adset.data };
      } else {
        body = { data: ad.data };
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };

    const out: string[] = [];
    for await (const insight of backfillMetaInsights({
      adAccountId: "act_1234567890",
      accessToken: "TOKEN",
      since: "2026-05-06",
      until: "2026-05-06",
      fetcher,
      sleeper: () => Promise.resolve(),
    })) {
      out.push(`${insight.campaign.level}:${insight.metric.spend}`);
    }

    expect(out).toEqual(["campaign:312.47", "ad_set:127.83", "ad:42.91"]);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("level=campaign");
    expect(calls[1]).toContain("level=adset");
    expect(calls[2]).toContain("level=ad");
  });
});
