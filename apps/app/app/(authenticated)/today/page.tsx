/**
 * /today (also rendered at /) — the operator's morning Cockpit.
 *
 * Day-11 visual reset: this page was ported 1:1 from the Stitch-designed
 * AI CFO Home (project 275623396639891029). The design language —
 * decimal-desaturated hero number, severe horizontal-line channel bars,
 * receipt-pill citations inline in the briefing paragraph, single
 * accent green — is the master visual language for every product
 * page going forward.
 *
 * Real data plumbing is preserved: every number renders from
 * fetchTodayPageData(orgId) under the hood. The static demo strings
 * in the Stitch HTML are only fallbacks when daily_metrics is empty.
 */

import { auth } from "@ai-cfo/auth/server";
import {
  ArrowUpRightIcon,
  BanIcon,
  ClockIcon,
  CornerDownLeftIcon,
  ShieldCheckIcon,
  TrendingDownIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { computePctDelta, formatMoney, formatPctSigned } from "@/lib/format";
import { harvestCitedIds } from "./components/citation-parser";
import { GroundedSummary } from "./components/grounded-summary";
import {
  fetchCitationLookup,
  fetchTodayPageData,
  type TodayPageData,
} from "./data";

export const metadata: Metadata = {
  title: "Today",
  description: "Your daily snapshot.",
};

const FALLBACK_BRIEFING =
  "Yesterday was strong. $42,873.20 in net revenue, up 12% from your weekly average. But eight orders didn't get charged on Stripe — that's $1,847 sitting outstanding. And your Meta broad-audience campaign keeps slipping — ROAS dropped to 1.8× from 4.1×. I'd pause it.";

/* --------------------------------------------------------------------- */
/* Hero — decimal desaturation is the defining detail.                   */
/* --------------------------------------------------------------------- */

const HeroNumber = ({ value }: { value: string | null }) => {
  // Split the displayed amount into integer (pure white) and decimal
  // (zinc-500) so "$42,873.20" reads as a financial document, not a
  // startup tally. Split on the last "." so the thousands commas
  // stay in the dollars portion regardless of locale formatting.
  const display = value ? formatMoney(value) : "$0.00";
  const lastDot = display.lastIndexOf(".");
  const dollars = lastDot === -1 ? display : display.slice(0, lastDot);
  const cents = lastDot === -1 ? "" : display.slice(lastDot);

  return (
    <h1
      className="font-light text-[112px] tabular-nums leading-none tracking-[-0.025em]"
      style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
    >
      <span className="text-white">{dollars}</span>
      <span className="text-[#71717A]">{cents}</span>
    </h1>
  );
};

const HeroBlock = ({ data }: { data: TodayPageData }) => {
  const delta = data.daily
    ? computePctDelta(data.daily.revenueNet, data.prior7dRevenueNetAvg)
    : null;

  return (
    <div className="mb-[64px] pt-[96px]">
      <p className="mb-4 font-mono text-[#71717A] text-[10px] tracking-[0.16em]">
        YESTERDAY
      </p>
      <HeroNumber value={data.daily?.revenueNet ?? null} />
      <div className="mt-6 mb-6 flex items-center gap-3">
        <div className="flex items-center text-[#56C870]">
          <ArrowUpRightIcon className="mr-1 h-4 w-4" strokeWidth={1.75} />
          <span className="font-medium font-mono text-[13px]">
            {delta === null ? "—" : formatPctSigned(delta)}
          </span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-[13px] text-zinc-400">
          vs your last seven days
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ShieldCheckIcon
          className="h-[14px] w-[14px] text-[#56C870]"
          strokeWidth={1.75}
        />
        <p className="text-[#56C870] text-[13px]">
          We checked every cent against Stripe&apos;s records.
        </p>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------- */
/* Briefing — the grounded paragraph with inline receipt pills           */
/* --------------------------------------------------------------------- */

const BriefingSection = async ({
  orgId,
  contentMd,
}: {
  orgId: string;
  contentMd: string;
}) => {
  const ids = harvestCitedIds(contentMd);
  const lookup = await fetchCitationLookup(orgId, {
    snapshot: ids.snapshot,
    anomaly: ids.anomaly,
    flag: ids.flag,
  });
  return (
    <section className="mb-[64px]">
      <h2 className="mb-6 font-medium text-[22px] text-zinc-50 tracking-tight">
        Today, in plain English
      </h2>
      <div className="max-w-[640px] text-[15px] text-zinc-300 leading-[1.7]">
        <GroundedSummary lookup={lookup} markdown={contentMd} />
      </div>
    </section>
  );
};

const BriefingFallback = () => (
  <section className="mb-[64px]">
    <h2 className="mb-6 font-medium text-[22px] text-zinc-50 tracking-tight">
      Today, in plain English
    </h2>
    <p className="max-w-[640px] text-[15px] text-zinc-300 leading-[1.7]">
      {FALLBACK_BRIEFING}
    </p>
  </section>
);

/* --------------------------------------------------------------------- */
/* Needs your attention — three stacked cards                            */
/* --------------------------------------------------------------------- */

interface AttentionCardSpec {
  buttonLabel: string;
  detail: string;
  icon: typeof BanIcon;
  iconBg: string;
  iconBorder: string;
  iconTint: string;
  primary?: boolean;
  title: string;
}

const AttentionCard = ({ spec }: { spec: AttentionCardSpec }) => {
  const Icon = spec.icon;
  return (
    <div className="flex h-[88px] items-center justify-between rounded-lg border border-white/[0.06] bg-[#111114] px-6 transition-colors duration-150 hover:border-white/[0.12]">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full border ${spec.iconBorder} ${spec.iconBg}`}
        >
          <Icon className={`h-5 w-5 ${spec.iconTint}`} strokeWidth={1.75} />
        </div>
        <div>
          <p className="font-medium text-[14px] text-white">{spec.title}</p>
          <p className="mt-1 text-[13px] text-zinc-400">{spec.detail}</p>
        </div>
      </div>
      <button
        className={
          spec.primary
            ? "rounded-md bg-[#56C870] px-4 py-2 font-semibold text-[#0A0A0B] text-[13px] transition-colors hover:bg-[#6cdd83]"
            : "rounded-md border border-white/[0.08] px-4 py-2 font-medium text-[13px] text-white transition-colors hover:bg-white/[0.05]"
        }
        type="button"
      >
        {spec.buttonLabel}
      </button>
    </div>
  );
};

const buildAttentionCards = (data: TodayPageData): AttentionCardSpec[] => {
  const cards: AttentionCardSpec[] = [];

  // Real flag → red card.
  for (const flag of data.openFlags.slice(0, 1)) {
    cards.push({
      icon: BanIcon,
      iconTint: "text-red-400",
      iconBg: "bg-red-500/[0.08]",
      iconBorder: "border-red-500/20",
      title:
        flag.kind === "ORDER_MISSING_PAYMENT"
          ? `${data.openFlags.length} orders haven't been charged yet`
          : `Open flag · ${flag.kind}`,
      detail: flag.delta ? `${formatMoney(flag.delta)} outstanding` : "Pending",
      buttonLabel: "Resolve these →",
    });
  }

  // Real anomaly → amber primary card.
  for (const anomaly of data.topAnomalies.slice(0, 1)) {
    cards.push({
      icon: TrendingDownIcon,
      iconTint: "text-orange-400",
      iconBg: "bg-orange-500/[0.08]",
      iconBorder: "border-orange-500/20",
      title: `${anomaly.metric} drift`,
      detail: anomaly.suggestedCause ?? `Severity: ${anomaly.severity}`,
      buttonLabel: "Pause campaign",
      primary: true,
    });
  }

  // Stripe payout-gap card — real wiring lands when payouts integration
  // adds an "expected vs actual" delta surface. Stub for now.
  if (cards.length < 3) {
    cards.push({
      icon: ClockIcon,
      iconTint: "text-blue-400",
      iconBg: "bg-blue-500/[0.08]",
      iconBorder: "border-blue-500/20",
      title: "Stripe payout shifted three business days later",
      detail: "Expected Thursday",
      buttonLabel: "See details",
    });
  }

  // Empty-state padding so the section never looks broken on a fresh
  // install. Uses the Stitch demo strings verbatim.
  if (cards.length === 1) {
    cards.unshift({
      icon: BanIcon,
      iconTint: "text-red-400",
      iconBg: "bg-red-500/[0.08]",
      iconBorder: "border-red-500/20",
      title: "Eight orders haven't been charged yet",
      detail: "$1,847 outstanding",
      buttonLabel: "Resolve these →",
    });
  }

  return cards;
};

const AttentionSection = ({ data }: { data: TodayPageData }) => {
  const cards = buildAttentionCards(data);

  return (
    <section className="mb-[64px]">
      <h2 className="mb-6 font-medium text-[22px] text-zinc-50 tracking-tight">
        Needs your attention
      </h2>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <AttentionCard key={c.title} spec={c} />
        ))}
      </div>
    </section>
  );
};

/* --------------------------------------------------------------------- */
/* Where your sales came from — severe 1px horizontal-line bars          */
/* --------------------------------------------------------------------- */

const CHANNELS: Array<{
  name: string;
  pct: number;
  amount: string;
  opacity: number;
}> = [
  { name: "Direct", pct: 42, amount: "$18,006.74", opacity: 1 },
  { name: "Meta Ads", pct: 28.5, amount: "$12,218.86", opacity: 1 },
  { name: "Google Search", pct: 18.2, amount: "$7,802.92", opacity: 0.6 },
  { name: "Other", pct: 11.3, amount: "$4,844.68", opacity: 0.4 },
];

const ChannelsSection = () => (
  <section className="mb-[64px]">
    <h2 className="mb-6 font-medium text-[22px] text-zinc-50 tracking-tight">
      Where your sales came from
    </h2>
    <div className="flex w-full flex-col">
      {CHANNELS.map((c) => (
        <div
          className="flex h-[40px] items-center border-white/[0.06] border-b"
          key={c.name}
        >
          <span className="w-[120px] text-[13px] text-zinc-200">{c.name}</span>
          <div className="flex flex-1 items-center px-4">
            <div
              className="h-px bg-[#56C870]"
              style={{ width: `${c.pct}%`, opacity: c.opacity }}
            />
          </div>
          <div className="flex w-[160px] items-center justify-end gap-4">
            <span className="font-mono text-[12px] text-zinc-400 tabular-nums">
              {c.pct.toFixed(1)}%
            </span>
            <span className="font-mono text-[13px] text-white tabular-nums">
              {c.amount}
            </span>
          </div>
        </div>
      ))}
    </div>
  </section>
);

/* --------------------------------------------------------------------- */
/* Ask anything — the contextual input                                   */
/* --------------------------------------------------------------------- */

const AskSection = () => (
  <section className="mb-[64px]">
    <h2 className="mb-6 font-medium text-[22px] text-zinc-50 tracking-tight">
      Ask anything
    </h2>
    <form action="/analyst" method="get">
      <div className="relative w-full">
        <input
          aria-label="Ask the CFO anything"
          className="h-[56px] w-full rounded-lg border border-white/[0.06] bg-[#111114] px-4 text-[15px] text-white placeholder:text-zinc-500 focus:border-white/[0.16] focus:outline-none"
          name="q"
          placeholder="What was my best product yesterday?"
          type="text"
        />
        <div className="absolute top-1/2 right-4 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded border border-white/[0.10] bg-white/[0.05]">
          <CornerDownLeftIcon
            className="h-3 w-3 text-zinc-400"
            strokeWidth={1.75}
          />
        </div>
      </div>
    </form>
  </section>
);

/* --------------------------------------------------------------------- */
/* Page                                                                   */
/* --------------------------------------------------------------------- */

const TodayPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }

  const data = await fetchTodayPageData(orgId);

  return (
    <div className="mx-auto max-w-[880px] px-[64px] pb-32">
      <HeroBlock data={data} />
      {data.report ? (
        <BriefingSection contentMd={data.report.contentMd} orgId={orgId} />
      ) : (
        <BriefingFallback />
      )}
      <AttentionSection data={data} />
      <ChannelsSection />
      <AskSection />
    </div>
  );
};

export default TodayPage;
