"use client";

/**
 * Tremor charts for the /metrics page. All four are presentational:
 * they accept a coerced-to-number row shape from the server and let
 * Tremor handle the rest. The valueFormatters mirror the dashboard's
 * format helpers so units are consistent across the app.
 */

import { AreaChart, LineChart } from "@tremor/react";
import type { MetricsRow } from "../data";

const moneyFormatter = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(n);

const ratioFormatter = (n: number): string => n.toFixed(2);
const pctFormatter = (n: number): string => `${(n * 100).toFixed(2)}%`;
const intFormatter = (n: number): string =>
  new Intl.NumberFormat("en-US").format(n);

interface ChartProps {
  readonly rows: readonly MetricsRow[];
}

export const RevenueChart = ({ rows }: ChartProps) => (
  <AreaChart
    categories={["revenueGross", "revenueNet"]}
    className="h-72"
    colors={["blue", "indigo"]}
    connectNulls
    data={[...rows]}
    index="date"
    valueFormatter={moneyFormatter}
  />
);

export const RoasChart = ({ rows }: ChartProps) => (
  <LineChart
    categories={["roas", "blendedMer"]}
    className="h-72"
    colors={["emerald", "amber"]}
    connectNulls
    data={[...rows]}
    index="date"
    valueFormatter={ratioFormatter}
  />
);

export const OrdersAovChart = ({ rows }: ChartProps) => (
  <LineChart
    categories={["orders", "newCustomers"]}
    className="h-72"
    colors={["violet", "cyan"]}
    connectNulls
    data={[...rows]}
    index="date"
    valueFormatter={intFormatter}
  />
);

export const RefundRateChart = ({ rows }: ChartProps) => (
  <LineChart
    categories={["refundRate"]}
    className="h-72"
    colors={["rose"]}
    connectNulls
    data={[...rows]}
    index="date"
    valueFormatter={pctFormatter}
  />
);
