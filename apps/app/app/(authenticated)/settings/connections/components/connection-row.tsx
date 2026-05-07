"use client";

import { Button } from "@ai-cfo/design-system/components/ui/button";
import { Input } from "@ai-cfo/design-system/components/ui/input";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

interface Properties {
  connected: boolean;
  source: "shopify" | "stripe";
}

export const ConnectionRow = ({ source, connected }: Properties) => {
  const [shop, setShop] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/connections/${source}/initiate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(source === "shopify" ? { shop } : {}),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`initiate failed: ${res.status} ${text.slice(0, 120)}`);
      }
      const json = (await res.json()) as { authorizeUrl: string };
      window.location.href = json.authorizeUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <Button
        disabled={busy}
        onClick={initiate}
        type="button"
        variant="outline"
      >
        Reconnect
      </Button>
    );
  }

  if (source === "shopify") {
    return (
      <div className="flex flex-col gap-2">
        <Input
          onChange={(e) => setShop(e.target.value)}
          placeholder="your-store.myshopify.com"
          value={shop}
        />
        <Button disabled={busy || !shop} onClick={initiate} type="button">
          {busy ? "Redirecting…" : "Connect Shopify"}
        </Button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={busy} onClick={initiate} type="button">
        {busy ? "Redirecting…" : "Connect Stripe"}
      </Button>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
};
