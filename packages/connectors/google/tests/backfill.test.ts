import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backfillGoogleAdsInsights, buildBackfillGAQL } from "../src/backfill";

const FIX = join(import.meta.dirname, "..", "fixtures");
const RUNNER_RE = /runner/;

describe("buildBackfillGAQL", () => {
  it("builds the canonical GAQL with date range", () => {
    const gaql = buildBackfillGAQL("2026-02-06", "2026-05-06");
    expect(gaql).toContain("FROM campaign");
    expect(gaql).toContain(
      "WHERE segments.date BETWEEN '2026-02-06' AND '2026-05-06'"
    );
    expect(gaql).toContain("metrics.cost_micros");
    expect(gaql).toContain("customer.currency_code");
  });
});

describe("Google Ads backfill iterator (mocked runner)", () => {
  it("iterates parsed rows from a fixture stream", async () => {
    const typical = JSON.parse(
      await readFile(join(FIX, "ads-campaign-typical.json"), "utf-8")
    ) as { results: { campaign: unknown }[] };
    const converted = JSON.parse(
      await readFile(join(FIX, "ads-campaign-converted.json"), "utf-8")
    ) as { results: { campaign: unknown }[] };
    const display = JSON.parse(
      await readFile(join(FIX, "ads-display-campaign.json"), "utf-8")
    ) as { results: { campaign: unknown }[] };

    const allRows = [
      typical.results[0],
      converted.results[0],
      display.results[0],
    ];

    // biome-ignore lint/suspicious/useAwait: generator yields without awaiting
    const runner = async function* () {
      for (const r of allRows) {
        yield r;
      }
    };

    const out: string[] = [];
    for await (const parsed of backfillGoogleAdsInsights({
      customerId: "1234567890",
      refreshToken: "x",
      developerToken: "y",
      clientId: "z",
      clientSecret: "w",
      since: "2026-05-06",
      runner,
    })) {
      out.push(`${parsed.campaign.objective}:${parsed.metric.spend}`);
    }
    expect(out).toEqual([
      "SEARCH:287.43",
      "PERFORMANCE_MAX:1234.56",
      "DISPLAY:0.00",
    ]);
  });

  it("throws when runner not provided", async () => {
    await expect(async () => {
      // Drain the iterator to force execution.
      for await (const _ of backfillGoogleAdsInsights({
        customerId: "x",
        refreshToken: "x",
        developerToken: "x",
        clientId: "x",
        clientSecret: "x",
        since: "2026-05-06",
      })) {
        // unreachable
      }
    }).rejects.toThrow(RUNNER_RE);
  });
});
