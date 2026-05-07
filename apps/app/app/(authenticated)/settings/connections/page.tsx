import { auth } from "@ai-cfo/auth/server";
import { database, dataConnections, eq } from "@ai-cfo/database";
import { Button } from "@ai-cfo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ai-cfo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConnectionRow } from "./components/connection-row";

export const metadata: Metadata = {
  title: "Connections — AI CFO",
  description: "Connect your data sources.",
};

const SOURCES = [
  {
    id: "shopify",
    label: "Shopify",
    description:
      "Orders, products, customers, payouts, fulfillments, inventory.",
    available: true,
  },
  {
    id: "stripe",
    label: "Stripe",
    description: "Charges, refunds, payouts, fees, disputes.",
    available: true,
  },
  {
    id: "meta",
    label: "Meta Ads",
    description: "Spend, ROAS, audiences.",
    available: false,
  },
  {
    id: "google",
    label: "Google Ads",
    description: "Spend, ROAS, audiences.",
    available: false,
  },
  {
    id: "quickbooks",
    label: "QuickBooks",
    description: "GL, AR, AP, COGS — accounting truth layer.",
    available: false,
  },
  {
    id: "xero",
    label: "Xero",
    description: "GL, AR, AP, COGS.",
    available: false,
  },
  {
    id: "netsuite",
    label: "NetSuite",
    description: "ERP truth layer.",
    available: false,
  },
  {
    id: "plaid",
    label: "Plaid",
    description: "Bank balances, cash flows.",
    available: false,
  },
] as const;

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
      lastError: dataConnections.lastError,
    })
    .from(dataConnections)
    .where(eq(dataConnections.orgId, orgId));

  const byId = new Map(rows.map((r) => [r.source, r]));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="font-semibold text-2xl">Connections</h1>
        <p className="text-muted-foreground text-sm">
          Connect your data sources to populate the daily report. The agent
          never sees raw vendor APIs — only the cent-exact truth layer.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SOURCES.map((s) => {
          const row = byId.get(s.id);
          return (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{s.label}</span>
                  {row?.status === "active" ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 text-xs dark:text-emerald-400">
                      Connected
                    </span>
                  ) : null}
                </CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {s.available ? (
                  <ConnectionRow
                    connected={row?.status === "active"}
                    source={s.id}
                  />
                ) : (
                  <Button disabled variant="outline">
                    Coming soon
                  </Button>
                )}
                {row?.lastSyncedAt ? (
                  <p className="mt-2 text-muted-foreground text-xs">
                    Last sync {row.lastSyncedAt.toISOString()}
                  </p>
                ) : null}
                {row?.lastError ? (
                  <p className="mt-2 text-destructive text-xs">
                    {row.lastError}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ConnectionsPage;
