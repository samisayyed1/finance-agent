// Intentionally NOT importing "server-only" here.
//
// `@ai-cfo/database` is consumed by both Next.js server contexts (apps/app
// API routes, server components) AND plain Bun runtimes (apps/mcp,
// apps/api Hono routes, scripts/, jobs/). The "server-only" marker — which
// throws at import time if pulled into a Next.js client bundle — is
// load-bearing only for the Next.js side. Bun has no concept of client
// vs server components, so the marker would crash Bun apps that have a
// legitimate need for the DB client.
//
// The Next.js client-component guard is preserved by client.ts'
// transitive consumers in apps/app being entirely server-side (server
// components + API routes). Day-4: if we ship UI client components that
// need DB-derived types, switch to a typed-only re-export so client
// bundles never see this module.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { keys } from "../keys";
import {
  agentFeedback,
  agentOutcomes,
  agentTraces,
  orgSettings,
  reports,
} from "./schema/closed-loop";
import { dataConnections, rawPayloads, syncRuns } from "./schema/connections";
import { dailyMetrics } from "./schema/metrics";
import {
  orderLineItems,
  orders,
  payments,
  payouts,
  refunds,
} from "./schema/orders";
import { organizations } from "./schema/organizations";
import { pages } from "./schema/pages";
import { anomalies, reconciliationFlags } from "./schema/reconciliation";

export const schema = {
  anomalies,
  pages,
  organizations,
  dataConnections,
  syncRuns,
  rawPayloads,
  dailyMetrics,
  orders,
  orderLineItems,
  payments,
  refunds,
  payouts,
  reconciliationFlags,
  agentTraces,
  agentFeedback,
  agentOutcomes,
  reports,
  orgSettings,
};

const globalForDb = global as unknown as {
  __aiCfoDbClient: postgres.Sql | undefined;
};

const sql =
  globalForDb.__aiCfoDbClient ??
  postgres(keys().DATABASE_URL, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__aiCfoDbClient = sql;
}

export const database = drizzle(sql, { schema });
