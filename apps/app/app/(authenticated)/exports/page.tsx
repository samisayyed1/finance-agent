/**
 * /exports — labeled "History" in the Cockpit sidebar. Day-12 reset.
 *
 * Two stacked surfaces:
 *   1. Daily briefings — recent days' reports, one row per day, each
 *      with a one-line summary in plain English and three actions.
 *   2. Exports — CSV/XLSX downloads. Each anchor links to the API
 *      route `apps/api/app/api/exports/[kind]`; pre-existing wiring.
 */

import { auth } from "@ai-cfo/auth/server";
import { database, desc, eq, reports } from "@ai-cfo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "History",
  description: "Every briefing, every export. 30 days back.",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

interface ExportItem {
  readonly href: string;
  readonly name: string;
  readonly ready: boolean;
  readonly size: string;
}

const EXPORT_ITEMS: readonly ExportItem[] = [
  {
    name: "Daily metrics · last 90 days.csv",
    href: `${API_BASE}/api/exports/metrics-csv?range=90`,
    size: "184 KB",
    ready: true,
  },
  {
    name: "Daily metrics · last 90 days.xlsx",
    href: `${API_BASE}/api/exports/metrics-xlsx?range=90`,
    size: "260 KB",
    ready: true,
  },
  {
    name: "Reconciliation flags · all-time.csv",
    href: `${API_BASE}/api/exports/flags-csv`,
    size: "42 KB",
    ready: true,
  },
  {
    name: "Anomalies · all-time.csv",
    href: `${API_BASE}/api/exports/anomalies-csv`,
    size: "18 KB",
    ready: true,
  },
  {
    name: "Top products · last 90 days.csv",
    href: "#",
    size: "—",
    ready: false,
  },
  {
    name: "Stripe payouts · last 12 months.csv",
    href: "#",
    size: "—",
    ready: false,
  },
];

const fmtDate = (d: Date): { date: string; weekday: string } => ({
  date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
});

const ExportsPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }

  const recent = await database
    .select({
      id: reports.id,
      date: reports.date,
      contentMd: reports.contentMd,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .where(eq(reports.orgId, orgId))
    .orderBy(desc(reports.date))
    .limit(14);

  // Demo briefings if there are no real reports yet — operators see what
  // the History page will look like.
  const demoBriefings = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i - 1);
    return {
      id: `demo-${i}`,
      date: d.toISOString().slice(0, 10),
      summary: [
        "Net rev $42,873.20 · 2 flags · ROAS held above 3.7×",
        "Net rev $38,420.50 · 1 flag · Meta broad-audience drift opened",
        "Net rev $41,290.00 · 0 flags · clean run",
        "Net rev $35,840.20 · 1 anomaly · refund spike on defective batch",
        "Net rev $47,180.10 · 0 flags · best Saturday this quarter",
        "Net rev $32,510.80 · 1 flag · Stripe payout shift detected",
        "Net rev $39,720.00 · 2 flags · 8 orders missing charges",
      ][i],
    };
  });

  const useRealReports = recent.length > 0;
  const briefingRows = useRealReports
    ? recent.map((r) => ({
        id: r.id,
        date: r.date,
        summary:
          r.contentMd.replace(/\s+/g, " ").slice(0, 120) +
          (r.contentMd.length > 120 ? "…" : ""),
      }))
    : demoBriefings;

  return (
    <div className="mx-auto max-w-[1000px] px-[64px] pt-[96px] pb-32">
      <p className="mb-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        HISTORY · BRIEFINGS &amp; EXPORTS
      </p>
      <h1 className="mb-3 font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
        Every briefing, every export.
      </h1>
      <p className="max-w-[620px] text-[15px] text-zinc-400 leading-[1.6]">
        30 days of grounded reports + CSV exports. Click any briefing to open
        the original. Click any CSV to re-download.
      </p>

      <section className="mt-16">
        <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-[-0.01em]">
          Daily briefings
        </h2>
        <div>
          {briefingRows.map((b) => {
            const d = new Date(`${b.date}T00:00:00Z`);
            const { date, weekday } = fmtDate(d);
            return (
              <div
                className="flex items-center gap-6 border-white/[0.06] border-b py-4 text-[13px]"
                key={b.id}
              >
                <div className="w-[100px] shrink-0">
                  <p className="font-medium font-mono text-[11px] text-zinc-200 uppercase tracking-wider">
                    {date}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-600">
                    {weekday}
                  </p>
                </div>
                <p className="flex-1 truncate text-zinc-300">{b.summary}</p>
                <div className="flex w-[240px] shrink-0 justify-end gap-2">
                  <button
                    className="inline-flex h-7 items-center rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
                    type="button"
                  >
                    Read →
                  </button>
                  <button
                    className="inline-flex h-7 items-center rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
                    type="button"
                  >
                    Forward
                  </button>
                  <button
                    className="inline-flex h-7 items-center rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
                    type="button"
                  >
                    Export
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-20">
        <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-[-0.01em]">
          Exports
        </h2>
        <div>
          <div className="flex border-white/[0.06] border-b py-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
            <span className="flex-1">NAME</span>
            <span className="w-[120px] text-right">SIZE</span>
            <span className="w-[140px] text-right">STATUS</span>
          </div>
          {EXPORT_ITEMS.map((item) => (
            <div
              className="flex h-12 items-center border-white/[0.06] border-b text-[13px]"
              key={item.name}
            >
              <span className="flex-1 truncate text-zinc-200">{item.name}</span>
              <span className="w-[120px] text-right font-mono text-zinc-500 tabular-nums">
                {item.size}
              </span>
              <span className="flex w-[140px] justify-end">
                {item.ready ? (
                  <a
                    className="inline-flex h-7 items-center gap-2 rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-200 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
                    href={item.href}
                    rel="noreferrer"
                  >
                    Ready · download →
                  </a>
                ) : (
                  <span className="inline-flex h-7 items-center rounded-full border border-white/[0.06] px-3 font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
                    Generating…
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 flex justify-end">
        <button
          className="inline-flex h-9 items-center rounded-md bg-[#56C870] px-5 font-semibold text-[#0A0A0B] text-[13px] transition-colors hover:bg-[#6cdd83]"
          type="button"
        >
          Schedule a recurring export →
        </button>
      </div>
    </div>
  );
};

export default ExportsPage;
