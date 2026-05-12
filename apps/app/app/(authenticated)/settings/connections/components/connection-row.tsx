"use client";

/**
 * Day-11 Cockpit-styled connection action button. Inline (right-aligned)
 * inside each connection card on /settings/connections.
 *
 * - Connected:    ghost "Manage →" button (single-click opens manage drawer; for now reconnect).
 * - Disconnected: "Connect <Source> →"; the page's chosen primary
 *                 source renders with the accent-green fill, others
 *                 render as ghost. Discipline: one primary per page.
 * - Shopify needs a shop subdomain — surfaces an inline input above
 *   the button.
 *
 * Network call is unchanged from Day-1: POST
 * `${NEXT_PUBLIC_API_URL}/api/connections/<source>/initiate` → 302 to
 * the source's OAuth authorize URL.
 */

import { cn } from "@ai-cfo/design-system/lib/utils";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

const PRIMARY_BTN_CLASS =
  "inline-flex h-8 items-center rounded-md bg-[#56C870] px-4 font-semibold text-[#0A0A0B] text-[13px] transition-colors hover:bg-[#6cdd83] disabled:cursor-not-allowed disabled:opacity-50";

const GHOST_BTN_CLASS =
  "inline-flex h-8 items-center rounded-md border border-white/[0.08] px-4 font-medium text-[13px] text-zinc-200 transition-colors hover:border-white/[0.16] hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const SOURCE_LABEL: Record<string, string> = {
  shopify: "Connect Shopify →",
  stripe: "Connect Stripe →",
  meta: "Connect Meta →",
  google: "Connect Google →",
};

interface Properties {
  connected: boolean;
  primary?: boolean;
  source: "shopify" | "stripe" | "meta" | "google";
}

export const ConnectionRow = ({ source, connected, primary }: Properties) => {
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
      <button
        className={GHOST_BTN_CLASS}
        disabled={busy}
        onClick={initiate}
        type="button"
      >
        Manage →
      </button>
    );
  }

  if (source === "shopify") {
    return (
      <div className="flex flex-col items-end gap-2">
        <input
          className="h-8 w-[220px] rounded-md border border-white/[0.06] bg-[#0A0A0B] px-3 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none"
          onChange={(e) => setShop(e.target.value)}
          placeholder="your-store.myshopify.com"
          value={shop}
        />
        <button
          className={cn(primary ? PRIMARY_BTN_CLASS : GHOST_BTN_CLASS)}
          disabled={busy || !shop}
          onClick={initiate}
          type="button"
        >
          {busy ? "Redirecting…" : SOURCE_LABEL[source]}
        </button>
        {error ? <p className="text-[#FB7185] text-[11px]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className={cn(primary ? PRIMARY_BTN_CLASS : GHOST_BTN_CLASS)}
        disabled={busy}
        onClick={initiate}
        type="button"
      >
        {busy ? "Redirecting…" : (SOURCE_LABEL[source] ?? "Connect →")}
      </button>
      {error ? <p className="text-[#FB7185] text-[11px]">{error}</p> : null}
    </div>
  );
};
