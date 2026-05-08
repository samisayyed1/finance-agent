/**
 * /exports — CSV/XLSX downloads. Each anchor links to the API route
 * `apps/api/app/api/exports/[kind]` which streams the file.
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
import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Exports — AI CFO",
  description: "Download CSV/XLSX exports for accounting + finance workflows.",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

interface ExportItem {
  readonly description: string;
  readonly href: string;
  readonly title: string;
}

const ITEMS: readonly ExportItem[] = [
  {
    title: "Daily metrics — CSV (90d)",
    description:
      "Per-day rows: revenue, refunds, fees, ad spend, ROAS, MER, CAC, AOV, orders, new customers.",
    href: `${API_BASE}/api/exports/metrics-csv?range=90`,
  },
  {
    title: "Daily metrics — XLSX (90d)",
    description: "Same data as the CSV, packaged as Excel.",
    href: `${API_BASE}/api/exports/metrics-xlsx?range=90`,
  },
  {
    title: "Reconciliation flags — CSV",
    description:
      "All open and historic reconciliation flags with status + delta.",
    href: `${API_BASE}/api/exports/flags-csv`,
  },
  {
    title: "Anomalies — CSV",
    description: "Statistical anomalies detected by the daily anomaly job.",
    href: `${API_BASE}/api/exports/anomalies-csv`,
  },
];

const ExportsPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="font-semibold text-2xl">Exports</h1>
        <p className="text-muted-foreground text-sm">
          Pull the underlying data into your accounting workflow. Every export
          is RLS-scoped to your organization.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {ITEMS.map((item) => (
          <Card key={item.href}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <a href={item.href} rel="noreferrer">
                  <DownloadIcon className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ExportsPage;
