/**
 * /metrics — historical Tremor charts. 7/30/90d range toggle via
 * `?range=N` query param (defaults to 30). Server-rendered.
 */

import { auth } from "@ai-cfo/auth/server";
import { Button } from "@ai-cfo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ai-cfo/design-system/components/ui/card";
import { cn } from "@ai-cfo/design-system/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  OrdersAovChart,
  RefundRateChart,
  RevenueChart,
  RoasChart,
} from "./components/charts";
import {
  fetchMetricsRange,
  isSupportedRange,
  type MetricsRange,
  SUPPORTED_RANGES,
} from "./data";

export const metadata: Metadata = {
  title: "Metrics — AI CFO",
  description: "Historical metrics charts.",
};

const DEFAULT_RANGE: MetricsRange = 30;

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const parseRange = (raw: string | string[] | undefined): MetricsRange => {
  if (typeof raw !== "string") {
    return DEFAULT_RANGE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && isSupportedRange(n)) {
    return n;
  }
  return DEFAULT_RANGE;
};

const RangeSwitcher = ({ active }: { active: MetricsRange }) => (
  <div className="flex gap-2">
    {SUPPORTED_RANGES.map((r) => (
      <Button
        asChild
        className={cn(active === r && "ring-2 ring-primary")}
        key={r}
        size="sm"
        variant={active === r ? "default" : "outline"}
      >
        <Link href={`/metrics?range=${r}`}>{r}d</Link>
      </Button>
    ))}
  </div>
);

const MetricsPage = async ({ searchParams }: PageProps) => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }
  const params = await searchParams;
  const range = parseRange(params.range);
  const rows = await fetchMetricsRange(orgId, range);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Metrics</h1>
          <p className="text-muted-foreground text-sm">
            Historical view of revenue, efficiency, and customer metrics.
          </p>
        </div>
        <RangeSwitcher active={range} />
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No data yet</CardTitle>
            <CardDescription>
              Once your daily metrics pipeline has populated rows, this page
              will show {range}-day rolling charts.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Gross + net (USD)</CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueChart rows={rows} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ROAS &amp; MER</CardTitle>
              <CardDescription>Ad efficiency ratios</CardDescription>
            </CardHeader>
            <CardContent>
              <RoasChart rows={rows} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Orders &amp; new customers</CardTitle>
              <CardDescription>Volume + acquisition</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersAovChart rows={rows} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Refund rate</CardTitle>
              <CardDescription>
                Daily refunds as a fraction of gross revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RefundRateChart rows={rows} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MetricsPage;
