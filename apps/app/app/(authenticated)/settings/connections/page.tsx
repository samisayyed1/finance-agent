/**
 * /settings/connections — Day-11 Cockpit port from Stitch screen
 * ddae…698. Where the operator plugs in their data sources.
 *
 * Real data wiring preserved: each card's status (Connected · synced
 * Nm ago / Not connected) reads from `data_connections` for the
 * authenticated org. Cards for sources without a row render as
 * "Not connected." Only one primary CTA per page (Iron Rule of the
 * design system): Meta Ads, the most common next step after Shopify
 * + Stripe.
 */

import { auth } from "@ai-cfo/auth/server";
import { database, dataConnections, eq } from "@ai-cfo/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsSubNav } from "../components/settings-sub-nav";
import { ConnectionRow } from "./components/connection-row";

export const metadata: Metadata = {
  title: "Connections",
  description: "Plug in your data sources. Shopify, Stripe, Meta, Google.",
};

type SourceId = "shopify" | "stripe" | "meta" | "google";

interface SourceSpec {
  readonly available: boolean;
  readonly id: SourceId;
  readonly label: string;
  readonly mark: string;
  readonly notConnectedNote?: string;
}

const SOURCES: readonly SourceSpec[] = [
  { id: "shopify", label: "Shopify", mark: "Shopify", available: true },
  { id: "stripe", label: "Stripe", mark: "stripe", available: true },
  {
    id: "meta",
    label: "Meta Ads",
    mark: "Meta",
    available: true,
    notConnectedNote: "Connect to start your daily briefings.",
  },
  {
    id: "google",
    label: "Google Ads",
    mark: "Google",
    available: true,
    notConnectedNote: "Connect to start your daily briefings.",
  },
];

const relativeAge = (t: Date | null): string => {
  if (!t) {
    return "never";
  }
  const ms = Date.now() - t.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) {
    return `synced ${min} minute${min === 1 ? "" : "s"} ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `synced ${hr} hour${hr === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(hr / 24);
  return `synced ${d} day${d === 1 ? "" : "s"} ago`;
};

const ConnectionsPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }

  const rows = await database
    .select({
      source: dataConnections.source,
      status: dataConnections.status,
      lastSyncedAt: dataConnections.lastSyncedAt,
    })
    .from(dataConnections)
    .where(eq(dataConnections.orgId, orgId));

  const byId = new Map(rows.map((r) => [r.source, r]));

  // Find the first NOT-connected available source — it gets the page's
  // single primary CTA. Discipline: only one primary fill per page.
  const firstDisconnectedAvailable = SOURCES.find(
    (s) => s.available && byId.get(s.id)?.status !== "active"
  );

  return (
    <div className="mx-auto max-w-[880px] px-[64px] pt-[96px] pb-32">
      <p className="mb-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        SETTINGS · CONNECTIONS
      </p>
      <h1 className="mb-3 font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
        Your data sources
      </h1>
      <p className="max-w-[540px] text-[15px] text-zinc-400 leading-[1.6]">
        We sync every hour. Webhooks via Hookdeck. Raw payloads stored immutable
        on Cloudflare R2 — your data, ours to verify, never to retrain on.
      </p>

      <div className="mt-12 mb-10">
        <SettingsSubNav active="connections" />
      </div>

      <div className="flex flex-col gap-3">
        {SOURCES.map((s) => {
          const row = byId.get(s.id);
          const connected = row?.status === "active";
          const isPrimary =
            !connected && s.id === firstDisconnectedAvailable?.id;
          return (
            <div
              className="flex h-[96px] items-center justify-between rounded-lg border border-white/[0.06] bg-[#111114] px-6 transition-colors hover:border-white/[0.12]"
              key={s.id}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/[0.06] bg-[#1A1A1F]">
                  <span className="font-semibold text-[10px] text-zinc-300 tracking-tight">
                    {s.mark}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-[15px] text-zinc-50">
                    {s.label}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[13px]">
                    <span
                      aria-hidden
                      className={`inline-block h-[6px] w-[6px] rounded-full ${
                        connected ? "bg-[#56C870]" : "bg-zinc-600"
                      }`}
                    />
                    <span
                      className={connected ? "text-zinc-400" : "text-zinc-500"}
                    >
                      {connected
                        ? `Connected · ${relativeAge(row?.lastSyncedAt ?? null)}`
                        : (s.notConnectedNote ?? "Not connected")}
                    </span>
                  </p>
                </div>
              </div>

              <ConnectionRow
                connected={connected}
                primary={isPrimary}
                source={s.id}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-[12px] text-zinc-600">
        Coming soon — QuickBooks · Xero · Plaid · NetSuite. Reply to your daily
        briefing to vote for what we wire next.
      </p>
    </div>
  );
};

export default ConnectionsPage;
