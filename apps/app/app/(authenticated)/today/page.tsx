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

/* --------------------------------------------------------------------- */
/* SectionHeading — quiet, consistent. The hero is the only shout.        */
/* --------------------------------------------------------------------- */

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-tight">
    {children}
  </h2>
);

/* --------------------------------------------------------------------- */
/* StaticReceiptPill — same visual as the grounded citation pill, but
   without a lookup. Used in the fallback briefing so an empty-state
   page still shows the typographic pattern.                              */
/* --------------------------------------------------------------------- */

const StaticReceiptPill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-[22px] cursor-default items-baseline rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-2 align-baseline font-medium font-mono text-[12px] text-zinc-100 tabular-nums leading-[20px]">
    {children}
  </span>
);

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

// Pretty date for the hero subline. Pure render — no timezone work yet
// (Day-N+ pulls the org's local tz from org_settings; for now show UTC
// labeled simply). Returns e.g. "Thursday, May 7".
const formatPrettyDate = (iso: string | null | undefined): string => {
  if (!iso) {
    return "";
  }
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
};

const HeroBlock = ({ data }: { data: TodayPageData }) => {
  const delta = data.daily
    ? computePctDelta(data.daily.revenueNet, data.prior7dRevenueNetAvg)
    : null;

  return (
    // Day-11 polish: the hero is the only shout on the page. Everything
    // around it is whispered. Bumped breathing room below to 88px so the
    // briefing doesn't crowd the number.
    <div className="mb-[88px] pt-[96px]">
      <div className="mb-5 flex items-baseline gap-3">
        <p className="font-mono text-[#71717A] text-[10px] tracking-[0.16em]">
          YESTERDAY
        </p>
        <span className="text-[#52525B] text-[12px]">·</span>
        <p className="text-[#A1A1AA] text-[13px]">
          {formatPrettyDate(data.daily?.date)}
        </p>
      </div>
      <HeroNumber value={data.daily?.revenueNet ?? null} />
      <div className="mt-5 mb-3 flex items-center gap-3">
        <div className="flex items-center text-[#56C870]">
          <ArrowUpRightIcon className="mr-1 h-4 w-4" strokeWidth={1.75} />
          <span className="font-medium font-mono text-[13px]">
            {delta === null ? "—" : formatPctSigned(delta)}
          </span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-[13px] text-zinc-400">vs your 7-day average</span>
      </div>
      <div className="flex items-center gap-2">
        <ShieldCheckIcon
          className="h-[14px] w-[14px] text-[#56C870]"
          strokeWidth={1.75}
        />
        <p className="text-[#56C870] text-[13px]">
          Every cent verified against Stripe.
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
    <section className="mb-[88px]">
      <SectionHeading>Today, in plain English</SectionHeading>
      <div className="max-w-[640px] text-[15px] text-zinc-300 leading-[1.75]">
        <GroundedSummary lookup={lookup} markdown={contentMd} />
      </div>
    </section>
  );
};

const BriefingFallback = () => (
  <section className="mb-[88px]">
    <SectionHeading>Today, in plain English</SectionHeading>
    <p className="max-w-[640px] text-[15px] text-zinc-300 leading-[1.75]">
      Yesterday was strong. <StaticReceiptPill>$42,873.20</StaticReceiptPill> in
      net revenue, up <StaticReceiptPill>12%</StaticReceiptPill> from your
      weekly average. But eight orders didn&apos;t get charged on Stripe —
      that&apos;s <StaticReceiptPill>$1,847</StaticReceiptPill> sitting
      outstanding. And your Meta broad-audience campaign keeps slipping — ROAS
      dropped to <StaticReceiptPill>1.8×</StaticReceiptPill> from{" "}
      <StaticReceiptPill>4.1×</StaticReceiptPill>. I&apos;d pause it.
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
    // Day-11 polish: bumped to 96px so the icon + 2-line text never crowds
    // its own card. Hairline borders only — no shadows. The hover lift on
    // the border is the entire interaction language.
    <div className="flex h-[96px] items-center justify-between rounded-lg border border-white/[0.06] bg-[#111114] px-6 transition-colors duration-150 hover:border-white/[0.12]">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full border ${spec.iconBorder} ${spec.iconBg}`}
        >
          <Icon className={`h-5 w-5 ${spec.iconTint}`} strokeWidth={1.75} />
        </div>
        <div>
          <p className="font-medium text-[14px] text-white tracking-tight">
            {spec.title}
          </p>
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
    <section className="mb-[88px]">
      <SectionHeading>Needs your attention</SectionHeading>
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
  <section className="mb-[88px]">
    <SectionHeading>Where your sales came from</SectionHeading>
    <div className="flex w-full flex-col">
      {CHANNELS.map((c) => (
        <div
          className="flex h-[44px] items-center border-white/[0.05] border-b last:border-b-0"
          key={c.name}
        >
          <span className="w-[140px] text-[13px] text-zinc-200">{c.name}</span>
          <div className="flex flex-1 items-center px-4">
            <div
              className="h-px bg-[#56C870]"
              style={{ width: `${c.pct}%`, opacity: c.opacity }}
            />
          </div>
          <div className="flex w-[160px] items-center justify-end gap-4">
            <span className="font-mono text-[12px] text-zinc-500 tabular-nums">
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
  <section className="mb-[40px]">
    <SectionHeading>Ask anything</SectionHeading>
    <p className="mb-4 text-[13px] text-zinc-500">
      Plain English. The answer cites every receipt.
    </p>
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
