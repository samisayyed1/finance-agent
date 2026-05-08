/**
 * Day-6: end-to-end parse → attribution propagation. Loads vendored
 * fixtures, calls parseEvent, asserts that
 * `orders.source_metadata.attribution.inferred_marketing_source` ends up
 * with the right value. The fixtures are the same shape Shopify's webhook
 * delivery uses (orders/create / orders/paid).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NormalizedOrder } from "../src/canonical/types";
import { parseEvent } from "../src/parse";

const FIX = join(import.meta.dirname, "..", "fixtures");

const loadOrder = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(FIX, name), "utf-8"));

const orderFromEvents = (
  events: ReturnType<typeof parseEvent>
): NormalizedOrder => {
  const order = events.find((e): e is NormalizedOrder => e.kind === "order");
  if (!order) {
    throw new Error("expected an order event");
  }
  return order;
};

interface AttributionShape {
  inferred_marketing_source: string;
  referring_host: string | null;
  utm_source: string | null;
}

const attrOf = (order: NormalizedOrder): AttributionShape => {
  const sm = order.sourceMetadata as { attribution?: AttributionShape };
  if (!sm.attribution) {
    throw new Error("expected sourceMetadata.attribution");
  }
  return sm.attribution;
};

describe("Shopify parse → attribution propagation", () => {
  it("Meta UTM fixture → inferred_marketing_source = 'meta'", async () => {
    const events = parseEvent({
      orgId: "org",
      rawPayload: await loadOrder("orders-create-utm-meta.json"),
      topic: "orders/create",
    });
    const order = orderFromEvents(events);
    const a = attrOf(order);
    expect(a.utm_source).toBe("facebook");
    expect(a.referring_host).toBe("m.facebook.com");
    expect(a.inferred_marketing_source).toBe("meta");
  });

  it("Google CPC fixture → inferred_marketing_source = 'google'", async () => {
    const events = parseEvent({
      orgId: "org",
      rawPayload: await loadOrder("orders-create-utm-google.json"),
      topic: "orders/create",
    });
    const order = orderFromEvents(events);
    expect(attrOf(order).inferred_marketing_source).toBe("google");
  });

  it("Organic fixture (no UTM, no referrer) → inferred_marketing_source = 'organic'", async () => {
    const events = parseEvent({
      orgId: "org",
      rawPayload: await loadOrder("orders-create-organic.json"),
      topic: "orders/create",
    });
    const order = orderFromEvents(events);
    expect(attrOf(order).inferred_marketing_source).toBe("organic");
  });

  it("Referring-host-only Facebook fixture → 'meta' (no UTM needed)", async () => {
    const events = parseEvent({
      orgId: "org",
      rawPayload: await loadOrder("orders-create-referring-fb.json"),
      topic: "orders/create",
    });
    const order = orderFromEvents(events);
    expect(attrOf(order).inferred_marketing_source).toBe("meta");
  });
});
