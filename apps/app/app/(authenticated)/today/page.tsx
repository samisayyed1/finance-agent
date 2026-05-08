/**
 * /today (also rendered at /) — the operator's morning snapshot.
 *
 * Pure server component. No live tool calls; everything reads from the
 * database tables that the closed-loop pipeline populates upstream
 * (compute-daily-metrics, anomaly-detector, reconciliation-checker,
 * delivery jobs).
 *
 * Empty-state strategy: every section degrades gracefully when its
 * data is missing. This is intentional — the page must render before
 * the operator has connected any sources, otherwise onboarding is
 * blocked.
 */

import { auth } from "@ai-cfo/auth/server";
import { Badge } from "@ai-cfo/design-system/components/ui/badge";
import { Button } from "@ai-cfo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ai-cfo/design-system/components/ui/card";
import { cn } from "@ai-cfo/design-system/lib/utils";
import {
  AlertTriangleIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  MinusIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  computePctDelta,
  formatInt,
  formatMoney,
  formatPctFromRatio,
  formatPctSigned,
  formatRatio,
} from "@/lib/format";
import {
  fetchTodayPageData,
  type TodayDailyMetrics,
  type TodaySyncHealth,
} from "./data";

export const metadata: Metadata = {
  title: "Today — AI CFO",
  description: "Your daily snapshot.",
};

const STALE_SYNC_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

const trendOf = (delta: number | null): "up" | "down" | "flat" => {
  if (delta === null) {
    return "flat";
  }
  if (delta > 0.5) {
    return "up";
  }
  if (delta < -0.5) {
    return "down";
  }
  return "flat";
};

const TrendIcon = ({ trend }: { trend: "up" | "down" | "flat" }) => {
  if (trend === "up") {
    return (
      <ArrowUpRightIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
    );
  }
  if (trend === "down") {
    return (
      <ArrowDownRightIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" />
    );
  }
  return <MinusIcon className="h-5 w-5 text-muted-foreground" />;
};

const isSyncHealthy = (s: TodaySyncHealth): boolean => {
  if (s.hasOpenAlert) {
    return false;
  }
  if (!s.lastSyncedAt) {
    return false;
  }
  const ageHours = (Date.now() - s.lastSyncedAt.getTime()) / MS_PER_HOUR;
  return ageHours < STALE_SYNC_HOURS;
};

const HeadlineCard = ({
  daily,
  prior7dAvg,
}: {
  daily: TodayDailyMetrics;
  prior7dAvg: string | null;
}) => {
  const delta = computePctDelta(daily.revenueNet, prior7dAvg);
  const trend = trendOf(delta);
  return (
    <Card>
      <CardHeader>
        <CardDescription>Net revenue · {daily.date}</CardDescription>
        <CardTitle className="text-4xl">
          {formatMoney(daily.revenueNet)}
        </CardTitle>
        <div className="flex items-center gap-2 pt-1 text-muted-foreground text-sm">
          <TrendIcon trend={trend} />
          <span>
            {delta === null
              ? "no prior period"
              : `${formatPctSigned(delta)} vs 7-day avg`}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-muted-foreground text-xs">
          snapshot:{daily.snapshotId}
        </p>
      </CardContent>
    </Card>
  );
};

const MetricTile = ({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string | null;
}) => (
  <Card>
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-2xl">{primary}</CardTitle>
    </CardHeader>
    {secondary ? (
      <CardContent>
        <p className="text-muted-foreground text-sm">{secondary}</p>
      </CardContent>
    ) : null}
  </Card>
);

const EmptyState = () => (
  <div className="mx-auto max-w-xl">
    <Card>
      <CardHeader>
        <CardTitle>Connect your data</CardTitle>
        <CardDescription>
          Once Shopify, Stripe, and your ad platforms are connected, this page
          will fill with daily metrics, flagged reconciliation drift, and an
          AI-generated morning briefing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/settings/connections">
            Go to Connections
            <ArrowRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  </div>
);

const TodayPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }

  const data = await fetchTodayPageData(orgId);

  if (!data.daily) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <header>
          <h1 className="font-semibold text-2xl">Today</h1>
          <p className="text-muted-foreground text-sm">
            Your daily snapshot — empty until your first sync completes.
          </p>
        </header>
        <EmptyState />
      </div>
    );
  }

  const { daily } = data;
  const refundRatePct = formatPctFromRatio(daily.refundRate);
  const orders = formatInt(daily.orders);
  const aov = formatMoney(daily.aov);
  const newCustomers = formatInt(daily.newCustomers);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="font-semibold text-2xl">Today</h1>
        <p className="text-muted-foreground text-sm">
          Snapshot for {daily.date}.
        </p>
      </header>

      <HeadlineCard daily={daily} prior7dAvg={data.prior7dRevenueNetAvg} />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Gross revenue"
          primary={formatMoney(daily.revenueGross)}
          secondary={`Refunds ${formatMoney(daily.refunds)} · Fees ${formatMoney(daily.fees)}`}
        />
        <MetricTile
          label="ROAS · MER"
          primary={formatRatio(daily.roas)}
          secondary={`MER ${formatRatio(daily.blendedMer)} · CAC ${formatMoney(daily.cac)}`}
        />
        <MetricTile
          label="Refund rate · new customers"
          primary={refundRatePct}
          secondary={`${newCustomers} new · ${orders} orders · AOV ${aov}`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What needs attention</CardTitle>
            <CardDescription>
              Open reconciliation flags + recent statistical anomalies.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.openFlags.length === 0 && data.topAnomalies.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing flagged — clean run.
              </p>
            ) : null}
            {data.openFlags.map((flag) => (
              <div
                className="flex items-start gap-3 rounded-md border p-3"
                key={flag.flagId}
              >
                <AlertTriangleIcon className="mt-0.5 h-4 w-4 text-amber-500" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{flag.kind}</span>
                    <Badge variant="outline">{flag.status}</Badge>
                  </div>
                  <p className="font-mono text-muted-foreground text-xs">
                    flag:{flag.flagId}
                  </p>
                  {flag.delta ? (
                    <p className="text-muted-foreground text-sm">
                      Δ {formatMoney(flag.delta)}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {data.topAnomalies.map((a) => (
              <div
                className="flex items-start gap-3 rounded-md border p-3"
                key={a.anomalyId}
              >
                <AlertTriangleIcon className="mt-0.5 h-4 w-4 text-rose-500" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      {a.metric} anomaly
                    </span>
                    <Badge variant="outline">{a.severity}</Badge>
                  </div>
                  <p className="font-mono text-muted-foreground text-xs">
                    anomaly:{a.anomalyId}
                  </p>
                  {a.suggestedCause ? (
                    <p className="text-muted-foreground text-sm">
                      {a.suggestedCause}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync health</CardTitle>
            <CardDescription>
              Connector freshness — green if synced in the last 24h.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.syncHealth.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No connectors yet.
              </p>
            ) : null}
            {data.syncHealth.map((s) => {
              const healthy = isSyncHealthy(s);
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  key={s.source}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-label={healthy ? "healthy" : "unhealthy"}
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full",
                        healthy ? "bg-emerald-500" : "bg-rose-500"
                      )}
                      role="img"
                    />
                    <span className="font-medium text-sm capitalize">
                      {s.source}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {s.lastSyncedAt
                      ? s.lastSyncedAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "never"}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {data.report ? (
        <Card>
          <CardHeader>
            <CardTitle>AI summary</CardTitle>
            <CardDescription>
              Generated for {data.report.date}.
              {data.report.traceId ? (
                <span className="ml-2 font-mono text-xs">
                  trace:{data.report.traceId}
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm">
              {data.report.contentMd}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default TodayPage;
