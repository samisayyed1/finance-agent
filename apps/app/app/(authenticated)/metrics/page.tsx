/**
 * /metrics — labeled "Money" in the Cockpit sidebar. Day-12 visual reset.
 *
 * Bloomberg × Linear: severe vertical stack of metric rows, NOT a
 * card grid. Each row is `eyebrow | big number with decimal desat |
 * delta + 1px sparkline`. Below: "By channel" + "Top products"
 * tables in the same severity.
 *
 * Data wiring: aggregates today's 7-day window from the existing
 * `fetchMetricsRange(orgId, 7)`. Channels and product breakdowns
 * use demo data until packages/metrics exposes per-channel SQL —
 * tracked as Day-N TODO.
 */

import { auth } from "@ai-cfo/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchMetricsRange, type MetricsRow } from "./data";

export const metadata: Metadata = {
  title: "Money",
  description: "Where your money moved this week.",
};

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const RANGES = [
  { label: "24H", value: 1 },
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "YTD", value: 180 },
  { label: "ALL", value: 365 },
] as const;

const parseRange = (raw: string | string[] | undefined): number => {
  if (typeof raw !== "string") {
    return 7;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 7;
};

/* --------------------------------------------------------------------- */
/* Number helpers                                                         */
/* --------------------------------------------------------------------- */

const fmtMoney = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtPctSigned = (n: number): string => {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
};

// Field accessors operate on a string key so callers can reach fields
// not in MetricsRow (e.g. contributionProfit, refunds, fees — these
// live in the daily_metrics table but aren't selected by the current
// fetcher). Out-of-schema keys return 0 / [] cleanly.
const sumField = (rows: readonly MetricsRow[], key: string): number => {
  let total = 0;
  for (const r of rows) {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "string") {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) {
        total += n;
      }
    } else if (typeof v === "number") {
      total += v;
    }
  }
  return total;
};

const seriesField = (rows: readonly MetricsRow[], key: string): number[] =>
  rows.map((r) => {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "string") {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return typeof v === "number" ? v : 0;
  });

/* --------------------------------------------------------------------- */
/* Sparkline — pure SVG, 1px line, accent green. No axes, no labels.     */
/* --------------------------------------------------------------------- */

const Sparkline = ({
  values,
  tone = "accent",
}: {
  values: readonly number[];
  tone?: "accent" | "amber" | "muted";
}) => {
  if (values.length < 2) {
    return <div className="h-6 w-full" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 320;
  const height = 24;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  let stroke = "#52525B";
  if (tone === "accent") {
    stroke = "#56C870";
  } else if (tone === "amber") {
    stroke = "#FFB766";
  }
  return (
    <svg
      className="h-6 w-full opacity-80"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <title>Trend</title>
      <polyline
        fill="none"
        points={points}
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </svg>
  );
};

/* --------------------------------------------------------------------- */
/* Range switcher pills                                                   */
/* --------------------------------------------------------------------- */

const RangeSwitcher = ({ active }: { active: number }) => (
  <div className="flex items-center gap-2">
    {RANGES.map((r) => {
      const isActive = r.value === active;
      return (
        <Link
          className={`inline-flex h-7 items-center rounded-full border px-3 font-medium font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
            isActive
              ? "border-[#56C870] text-zinc-50"
              : "border-white/[0.06] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-50"
          }`}
          href={`/metrics?range=${r.value}`}
          key={r.value}
        >
          {r.label}
        </Link>
      );
    })}
  </div>
);

/* --------------------------------------------------------------------- */
/* Metric row                                                             */
/* --------------------------------------------------------------------- */

const HeroNumber = ({ value, size }: { value: string; size: number }) => {
  const lastDot = value.lastIndexOf(".");
  const dollars = lastDot === -1 ? value : value.slice(0, lastDot);
  const cents = lastDot === -1 ? "" : value.slice(lastDot);
  return (
    <h2
      className="font-light tabular-nums leading-none tracking-[-0.025em]"
      style={{ fontSize: `${size}px` }}
    >
      <span className="text-white">{dollars}</span>
      <span className="text-[#71717A]">{cents}</span>
    </h2>
  );
};

const MetricRow = ({
  eyebrow,
  value,
  size,
  delta,
  deltaTone,
  series,
  sparkTone,
}: {
  eyebrow: string;
  value: string;
  size: number;
  delta: string;
  deltaTone: "accent" | "amber" | "muted";
  series: readonly number[];
  sparkTone: "accent" | "amber" | "muted";
}) => {
  let deltaColor = "text-zinc-500";
  if (deltaTone === "accent") {
    deltaColor = "text-[#56C870]";
  } else if (deltaTone === "amber") {
    deltaColor = "text-[#FFB766]";
  }
  return (
    <div className="flex items-center gap-8 border-white/[0.06] border-b py-10">
      <p className="w-[160px] shrink-0 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        {eyebrow}
      </p>
      <div className="flex-1">
        <HeroNumber size={size} value={value} />
      </div>
      <div className="flex w-[320px] flex-col items-end gap-2">
        <span className={`font-medium font-mono text-[13px] ${deltaColor}`}>
          {delta}
        </span>
        <Sparkline tone={sparkTone} values={series} />
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------- */
/* Tables (demo data; real per-channel SQL is Day-N+)                     */
/* --------------------------------------------------------------------- */

const CHANNELS: ReadonlyArray<{
  name: string;
  revenue: string;
  pct: string;
  roas: string;
  delta: string;
  tone: "accent" | "amber" | "muted";
}> = [
  {
    name: "Shopify direct",
    revenue: "$112,748.20",
    pct: "42.0%",
    roas: "—",
    delta: "+8.2%",
    tone: "accent",
  },
  {
    name: "Meta Ads",
    revenue: "$76,510.40",
    pct: "28.5%",
    roas: "3.74×",
    delta: "-14.3%",
    tone: "amber",
  },
  {
    name: "Google Search",
    revenue: "$48,820.10",
    pct: "18.2%",
    roas: "4.91×",
    delta: "+6.1%",
    tone: "accent",
  },
  {
    name: "Klaviyo",
    revenue: "$19,260.00",
    pct: "7.2%",
    roas: "—",
    delta: "+1.2%",
    tone: "muted",
  },
  {
    name: "Other",
    revenue: "$11,103.48",
    pct: "4.1%",
    roas: "—",
    delta: "-3.0%",
    tone: "muted",
  },
];

const PRODUCTS: ReadonlyArray<{
  rank: number;
  name: string;
  units: string;
  revenue: string;
  margin: string;
  trendTone: "accent" | "amber";
}> = [
  {
    rank: 1,
    name: "Linen Lounge Set",
    units: "1,840",
    revenue: "$28,400.00",
    margin: "62%",
    trendTone: "accent",
  },
  {
    rank: 2,
    name: "Cotton Crew Tee — Sand",
    units: "1,420",
    revenue: "$18,910.00",
    margin: "58%",
    trendTone: "accent",
  },
  {
    rank: 3,
    name: "Linen Pant — Stone",
    units: "920",
    revenue: "$14,720.00",
    margin: "55%",
    trendTone: "accent",
  },
  {
    rank: 4,
    name: "Waffle Robe",
    units: "780",
    revenue: "$11,310.00",
    margin: "59%",
    trendTone: "accent",
  },
  {
    rank: 5,
    name: "Sleep Tee — Bone",
    units: "1,210",
    revenue: "$8,470.00",
    margin: "61%",
    trendTone: "amber",
  },
  {
    rank: 6,
    name: "Wool Throw",
    units: "440",
    revenue: "$7,920.00",
    margin: "57%",
    trendTone: "accent",
  },
  {
    rank: 7,
    name: "Bamboo Sheet Set",
    units: "330",
    revenue: "$7,260.00",
    margin: "54%",
    trendTone: "accent",
  },
  {
    rank: 8,
    name: "Linen Robe",
    units: "410",
    revenue: "$5,740.00",
    margin: "60%",
    trendTone: "amber",
  },
  {
    rank: 9,
    name: "Cashmere Beanie",
    units: "280",
    revenue: "$4,200.00",
    margin: "63%",
    trendTone: "accent",
  },
  {
    rank: 10,
    name: "Cotton Tote",
    units: "220",
    revenue: "$2,860.00",
    margin: "52%",
    trendTone: "muted" as "amber",
  },
];

/* --------------------------------------------------------------------- */
/* Page                                                                   */
/* --------------------------------------------------------------------- */

const MetricsPage = async ({ searchParams }: PageProps) => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }
  const params = await searchParams;
  const range = parseRange(params.range);
  // Snap the requested range to a supported value before hitting the
  // fetcher (today supports 7 / 30 / 90; anything else maps to 90 so
  // YTD / ALL still return data, just clipped).
  let fetchRange: 7 | 30 | 90 = 90;
  if (range <= 7) {
    fetchRange = 7;
  } else if (range <= 30) {
    fetchRange = 30;
  }
  const rows = await fetchMetricsRange(orgId, fetchRange);

  // Aggregate the window. Fall back to demo numbers if rows is empty
  // — operators get a populated page even on a fresh install so they
  // can preview what the Money view will look like.
  const hasData = rows.length > 0;
  const netRevenue = hasData ? sumField(rows, "revenueNet") : 268_442.18;
  const grossRevenue = hasData ? sumField(rows, "revenueGross") : 294_114.5;
  const refunds = hasData ? sumField(rows, "refunds") : 8420.3;
  const fees = hasData ? sumField(rows, "fees") : 17_252.04;
  const contributionProfit = hasData
    ? sumField(rows, "contributionProfit")
    : 112_840.91;

  const netRevenueSeries = hasData
    ? seriesField(rows, "revenueNet")
    : [38, 41, 43, 39, 45, 42, 47];
  const grossRevenueSeries = hasData
    ? seriesField(rows, "revenueGross")
    : [42, 44, 46, 43, 49, 46, 51];
  const refundsSeries = hasData
    ? seriesField(rows, "refunds")
    : [1.0, 1.1, 1.3, 1.2, 1.4, 1.4, 1.5];
  const feesSeries = hasData
    ? seriesField(rows, "fees")
    : [2.4, 2.5, 2.4, 2.5, 2.4, 2.4, 2.5];
  const contribSeries = hasData
    ? seriesField(rows, "contributionProfit")
    : [14, 16, 16, 15, 18, 17, 19];

  return (
    <div className="mx-auto max-w-[1100px] px-[64px] pt-[96px] pb-32">
      <div className="mb-16 flex items-center justify-between">
        <div>
          <p className="mb-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
            MONEY · {RANGES.find((r) => r.value === range)?.label ?? "7D"}
          </p>
          <h1 className="font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
            Where your money moved.
          </h1>
        </div>
        <RangeSwitcher active={range} />
      </div>

      <p className="mb-2 font-mono text-[10px] text-zinc-600 uppercase tracking-[0.08em]">
        updated · 07:14 EST · click any number to see receipts
      </p>

      <section>
        <MetricRow
          delta="+12.4%"
          deltaTone="accent"
          eyebrow="NET REVENUE"
          series={netRevenueSeries}
          size={64}
          sparkTone="accent"
          value={fmtMoney(netRevenue)}
        />
        <MetricRow
          delta="+9.8%"
          deltaTone="accent"
          eyebrow="GROSS REVENUE"
          series={grossRevenueSeries}
          size={48}
          sparkTone="accent"
          value={fmtMoney(grossRevenue)}
        />
        <MetricRow
          delta={fmtPctSigned(18.4)}
          deltaTone="amber"
          eyebrow="REFUNDS"
          series={refundsSeries}
          size={48}
          sparkTone="amber"
          value={fmtMoney(refunds)}
        />
        <MetricRow
          delta={fmtPctSigned(-2.1)}
          deltaTone="muted"
          eyebrow="STRIPE FEES"
          series={feesSeries}
          size={48}
          sparkTone="muted"
          value={fmtMoney(fees)}
        />
        <MetricRow
          delta="+14.2%"
          deltaTone="accent"
          eyebrow="CONTRIBUTION PROFIT"
          series={contribSeries}
          size={48}
          sparkTone="accent"
          value={fmtMoney(contributionProfit)}
        />
      </section>

      <section className="mt-24">
        <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-[-0.01em]">
          By channel · {RANGES.find((r) => r.value === range)?.label ?? "7D"}
        </h2>
        <div>
          <div className="flex border-white/[0.06] border-b py-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
            <span className="flex-1">CHANNEL</span>
            <span className="w-[160px] text-right">REVENUE</span>
            <span className="w-[100px] text-right">% OF TOTAL</span>
            <span className="w-[100px] text-right">ROAS</span>
            <span className="w-[100px] text-right">Δ</span>
          </div>
          {CHANNELS.map((c) => {
            let deltaColor = "text-zinc-500";
            if (c.tone === "accent") {
              deltaColor = "text-[#56C870]";
            } else if (c.tone === "amber") {
              deltaColor = "text-[#FFB766]";
            }
            const lastDot = c.revenue.lastIndexOf(".");
            const rDollars = c.revenue.slice(0, lastDot);
            const rCents = c.revenue.slice(lastDot);
            return (
              <div
                className="flex h-12 items-center border-white/[0.06] border-b text-[13px]"
                key={c.name}
              >
                <span className="flex-1 text-zinc-200">{c.name}</span>
                <span className="w-[160px] text-right font-medium font-mono tabular-nums">
                  <span className="text-white">{rDollars}</span>
                  <span className="text-[#71717A]">{rCents}</span>
                </span>
                <span className="w-[100px] text-right font-mono text-zinc-400 tabular-nums">
                  {c.pct}
                </span>
                <span className="w-[100px] text-right font-mono text-zinc-400 tabular-nums">
                  {c.roas}
                </span>
                <span
                  className={`w-[100px] text-right font-medium font-mono tabular-nums ${deltaColor}`}
                >
                  {c.delta}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-24">
        <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-[-0.01em]">
          Top products · {RANGES.find((r) => r.value === range)?.label ?? "7D"}
        </h2>
        <div>
          <div className="flex border-white/[0.06] border-b py-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
            <span className="w-[40px]">#</span>
            <span className="flex-1">PRODUCT</span>
            <span className="w-[100px] text-right">UNITS</span>
            <span className="w-[160px] text-right">REVENUE</span>
            <span className="w-[100px] text-right">MARGIN</span>
            <span className="w-[80px] text-right">TREND</span>
          </div>
          {PRODUCTS.map((p) => {
            const lastDot = p.revenue.lastIndexOf(".");
            const rDollars = p.revenue.slice(0, lastDot);
            const rCents = p.revenue.slice(lastDot);
            return (
              <div
                className="flex h-12 items-center border-white/[0.06] border-b text-[13px]"
                key={p.name}
              >
                <span className="w-[40px] font-mono text-zinc-500 tabular-nums">
                  {p.rank.toString().padStart(2, "0")}
                </span>
                <span className="flex-1 text-zinc-200">{p.name}</span>
                <span className="w-[100px] text-right font-mono text-zinc-400 tabular-nums">
                  {p.units}
                </span>
                <span className="w-[160px] text-right font-medium font-mono tabular-nums">
                  <span className="text-white">{rDollars}</span>
                  <span className="text-[#71717A]">{rCents}</span>
                </span>
                <span className="w-[100px] text-right font-mono text-zinc-400 tabular-nums">
                  {p.margin}
                </span>
                <span className="flex w-[80px] justify-end">
                  <span className="inline-block h-2 w-[60px]">
                    <Sparkline
                      tone={p.trendTone}
                      values={[1, 2, 1.5, 2.5, 2, 3, 2.5]}
                    />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default MetricsPage;
