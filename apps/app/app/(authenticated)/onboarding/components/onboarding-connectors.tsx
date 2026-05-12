"use client";

/**
 * 2×2 grid of connector cards on the onboarding wizard. Shopify gets
 * the page's single primary CTA. Each card POSTs to the same OAuth
 * initiate endpoint /settings/connections uses, so the OAuth dance is
 * identical for new operators and existing ones.
 */

import { cn } from "@ai-cfo/design-system/lib/utils";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

interface ConnectorSpec {
  readonly id: "shopify" | "stripe" | "meta" | "google";
  readonly label: string;
  readonly mark: string;
  readonly primary?: boolean;
  readonly tagline: string;
}

const CONNECTORS: readonly ConnectorSpec[] = [
  {
    id: "shopify",
    label: "Shopify",
    mark: "Shopify",
    tagline: "Most operators start here.",
    primary: true,
  },
  {
    id: "stripe",
    label: "Stripe",
    mark: "stripe",
    tagline: "Connect your Stripe Connect account.",
  },
  {
    id: "meta",
    label: "Meta Ads",
    mark: "Meta",
    tagline: "We'll start tracking ROAS within 24 hours.",
  },
  {
    id: "google",
    label: "Google Ads",
    mark: "Google",
    tagline: "Same as Meta — ROAS, CAC, conversion drift.",
  },
];

const PRIMARY_BTN_CLASS =
  "inline-flex h-8 items-center rounded-md bg-[#56C870] px-4 font-semibold text-[#0A0A0B] text-[13px] transition-colors hover:bg-[#6cdd83] disabled:cursor-not-allowed disabled:opacity-50";

const GHOST_BTN_CLASS =
  "inline-flex h-8 items-center rounded-md border border-white/[0.08] px-4 font-medium text-[13px] text-zinc-200 transition-colors hover:border-white/[0.16] hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

export const OnboardingConnectors = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);

  const initiate = async (source: ConnectorSpec["id"]) => {
    setBusy(source);
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
      setBusy(null);
    }
  };

  return (
    <div className="grid w-full grid-cols-2 gap-3">
      {CONNECTORS.map((c) => (
        <div
          className="flex h-[200px] flex-col justify-between rounded-lg border border-white/[0.06] bg-[#111114] p-6"
          key={c.id}
        >
          <div>
            <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.06] bg-[#1A1A1F]">
              <span className="font-semibold text-[10px] text-zinc-300 tracking-tight">
                {c.mark}
              </span>
            </div>
            <p className="mb-1 font-medium text-[14px] text-zinc-50">
              {c.label}
            </p>
            <p className="text-[13px] text-zinc-400 leading-[1.6]">
              {c.tagline}
            </p>
          </div>

          {c.id === "shopify" ? (
            <div className="flex flex-col gap-2">
              <input
                className="h-8 w-full rounded-md border border-white/[0.06] bg-[#0A0A0B] px-3 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none"
                onChange={(e) => setShop(e.target.value)}
                placeholder="your-store.myshopify.com"
                value={shop}
              />
              <button
                className={cn(PRIMARY_BTN_CLASS, "w-full justify-center")}
                disabled={busy !== null || !shop}
                onClick={() => initiate("shopify")}
                type="button"
              >
                {busy === "shopify" ? "Redirecting…" : "Connect Shopify →"}
              </button>
            </div>
          ) : (
            <button
              className={cn(GHOST_BTN_CLASS, "w-full justify-center")}
              disabled={busy !== null}
              onClick={() => initiate(c.id)}
              type="button"
            >
              {busy === c.id
                ? "Redirecting…"
                : `Connect ${c.label.replace(" Ads", "")} →`}
            </button>
          )}
        </div>
      ))}
      {error ? (
        <p className="col-span-2 text-[#FB7185] text-[12px]">{error}</p>
      ) : null}
    </div>
  );
};
