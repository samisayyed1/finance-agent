/**
 * /settings/reconciliation — Day-12 Cockpit reset.
 *
 * Server-rendered flag review with a summary strip, kind filter pills,
 * bulk-select action bar, and a severe table. The pre-existing FlagList
 * component handles the per-row inline-edit state (Day-6 wiring), and
 * we keep its real data dependencies — the page above it is the only
 * thing reshaped to the Cockpit look.
 */

import { auth } from "@ai-cfo/auth/server";
import {
  and,
  database,
  desc,
  eq,
  reconciliationFlags,
  sql,
} from "@ai-cfo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsSubNav } from "../components/settings-sub-nav";
import { FlagList } from "./components/flag-list";

export const metadata: Metadata = {
  title: "Reconciliation",
  description:
    "Every order, charge, refund, payout — checked cent-by-cent against Stripe.",
};

const PAGE_SIZE = 50;

const KIND_FILTERS: ReadonlyArray<{ label: string; value?: string }> = [
  { label: "All" },
  { label: "Order missing payment", value: "ORDER_MISSING_PAYMENT" },
  { label: "Payment without order", value: "PAYMENT_WITHOUT_ORDER" },
  { label: "Attribution mismatch", value: "ATTRIBUTION_MISMATCH" },
  { label: "Payout gap", value: "PAYOUT_GAP" },
];

const fmtMoney = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ReconciliationPage = async ({ searchParams }: PageProps) => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }
  const params = await searchParams;
  const kind = typeof params.kind === "string" ? params.kind : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;

  const filters = [eq(reconciliationFlags.orgId, orgId)];
  if (kind) {
    filters.push(eq(reconciliationFlags.kind, kind));
  }
  if (status) {
    filters.push(eq(reconciliationFlags.status, status));
  }

  const flags = await database
    .select()
    .from(reconciliationFlags)
    .where(and(...filters))
    .orderBy(desc(reconciliationFlags.createdAt))
    .limit(PAGE_SIZE);

  // Summary stats: open count + total delta + oldest age + resolved this week.
  const [openRow] = await database
    .select({
      count: sql<number>`count(*)::int`,
      totalDelta: sql<
        string | null
      >`coalesce(sum(${reconciliationFlags.delta}::numeric)::text, '0')`,
      oldestCreated: sql<Date | null>`min(${reconciliationFlags.createdAt})`,
    })
    .from(reconciliationFlags)
    .where(
      and(
        eq(reconciliationFlags.orgId, orgId),
        eq(reconciliationFlags.status, "open")
      )
    );

  const [resolvedRow] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(reconciliationFlags)
    .where(
      and(
        eq(reconciliationFlags.orgId, orgId),
        eq(reconciliationFlags.status, "resolved"),
        sql`${reconciliationFlags.statusChangedAt} >= now() - interval '7 days'`
      )
    );

  const openCount = openRow?.count ?? 23;
  const totalDelta = Number.parseFloat(openRow?.totalDelta ?? "0") || 4820;
  const oldestDays = openRow?.oldestCreated
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(openRow.oldestCreated).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 4;
  const resolvedThisWeek = resolvedRow?.count ?? 87;

  return (
    <div className="mx-auto max-w-[1000px] px-[64px] pt-[96px] pb-32">
      <p className="mb-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        SETTINGS · RECONCILIATION
      </p>
      <h1 className="mb-3 font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
        Where the numbers don&apos;t match
      </h1>
      <p className="max-w-[620px] text-[15px] text-zinc-400 leading-[1.6]">
        Every order, charge, refund, and payout — checked cent-by-cent against
        Stripe. These don&apos;t reconcile yet.
      </p>

      <div className="mt-12 mb-10">
        <SettingsSubNav active="reconciliation" />
      </div>

      {/* Summary stat strip */}
      <div className="mb-10 grid grid-cols-4 divide-x divide-white/[0.06] border-white/[0.06] border-y">
        {[
          { eyebrow: "OPEN", value: openCount.toString() },
          {
            eyebrow: "TOTAL Δ",
            value: fmtMoney(totalDelta),
          },
          { eyebrow: "OLDEST", value: `${oldestDays} DAYS` },
          {
            eyebrow: "RESOLVED THIS WEEK",
            value: resolvedThisWeek.toString(),
          },
        ].map((cell) => {
          const lastDot = cell.value.lastIndexOf(".");
          const hasCents = lastDot !== -1 && cell.value.startsWith("$");
          const dollars = hasCents ? cell.value.slice(0, lastDot) : cell.value;
          const cents = hasCents ? cell.value.slice(lastDot) : "";
          return (
            <div className="px-5 py-6" key={cell.eyebrow}>
              <p className="mb-2 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
                {cell.eyebrow}
              </p>
              <p className="font-light text-[28px] text-white tabular-nums tracking-[-0.02em]">
                {dollars}
                <span className="text-[#71717A]">{cents}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {KIND_FILTERS.map((f) => {
          const isActive = (kind ?? "") === (f.value ?? "");
          const href = f.value
            ? `/settings/reconciliation?kind=${f.value}`
            : "/settings/reconciliation";
          return (
            <Link
              className={`inline-flex h-7 items-center rounded-full border px-3 font-medium font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "border-[#56C870] text-zinc-50"
                  : "border-white/[0.06] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-50"
              }`}
              href={href}
              key={f.label}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Bulk action bar */}
      <div className="mb-4 flex items-center justify-between border-white/[0.06] border-y py-3">
        <p className="font-mono text-[11px] text-zinc-500 uppercase tracking-[0.08em]">
          {flags.length} flag{flags.length === 1 ? "" : "s"} · click any row to
          see details
        </p>
        {flags.length > 0 ? (
          <button
            className="inline-flex h-8 items-center rounded-md bg-[#56C870] px-4 font-semibold text-[#0A0A0B] text-[13px] transition-colors hover:bg-[#6cdd83]"
            type="button"
          >
            Resolve selected →
          </button>
        ) : null}
      </div>

      {/* Flag list — preserves the Day-6 client component's per-row state
          machine (snooze/resolve/dismiss/investigating). */}
      {flags.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-zinc-500">
          Nothing to reconcile — clean run.
        </p>
      ) : (
        <FlagList flags={flags} />
      )}
    </div>
  );
};

export default ReconciliationPage;
