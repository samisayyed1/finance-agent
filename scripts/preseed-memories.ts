#!/usr/bin/env bun
/**
 * Pre-seed 5 baseline agent_memories for the demo org so the closed-loop
 * substrate is "warm" for when the agent eventually runs (deferred Phase 4).
 *
 * Usage:
 *   bun run scripts/preseed-memories.ts --slug=demo-shopify-brand
 */

import { database, eq, organizations } from "@ai-cfo/database";
import { createFakeEmbedder, writeMemory } from "@ai-cfo/memory";

const parseSlug = (): string => {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--slug=")) {
      return arg.slice("--slug=".length);
    }
    if (arg === "--slug" || arg === "-s") {
      const idx = process.argv.indexOf(arg);
      if (idx > 0 && idx + 1 < process.argv.length) {
        return process.argv[idx + 1];
      }
    }
  }
  return "demo-shopify-brand";
};

const SLUG = parseSlug();

const seedMemories = [
  {
    kind: "pattern" as const,
    confidence: 0.85,
    content:
      "Maeve Co. revenue peaks Tuesday-Thursday; Sundays consistently 40% below weekday average.",
  },
  {
    kind: "vendor_quirk" as const,
    confidence: 0.85,
    content:
      "Default payment processor is Stripe; expect 2-3 day payout delay around US bank holidays.",
  },
  {
    kind: "pattern" as const,
    confidence: 0.85,
    content:
      "Refunds correlate with shipping defects; customer service tagged as 'supplier issue' indicates supply chain root cause.",
  },
  {
    kind: "pattern" as const,
    confidence: 0.85,
    content:
      "Meta broad-audience campaigns historically drop below 2.5 ROAS by week 6 of activation.",
  },
  {
    kind: "pattern" as const,
    confidence: 0.85,
    content:
      "Klaviyo email flow conversions land in attribution as 'klaviyo'; tend to be repeat customers.",
  },
];

const main = async () => {
  const [org] = await database
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, SLUG))
    .limit(1);

  if (!org) {
    console.error(
      `Org not found for slug=${SLUG}. Run seed-demo-org.ts first.`
    );
    process.exit(1);
  }

  console.log(
    `Writing ${seedMemories.length} memories for ${org.name} (${org.id})...`
  );

  const fakeEmbedder = createFakeEmbedder();

  for (const mem of seedMemories) {
    const { memoryId } = await writeMemory(
      {
        orgId: org.id,
        kind: mem.kind,
        content: mem.content,
        confidence: mem.confidence,
      },
      { embedder: fakeEmbedder }
    );
    console.log(`  [${mem.kind}] ${memoryId}`);
  }

  console.log("Done.");
};

main().catch((err) => {
  console.error("preseed-memories: FAILED", err);
  process.exit(1);
});
