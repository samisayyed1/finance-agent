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
import { adCampaigns, adMetricsDaily } from "./schema/ad-spend";
import {
  agentFeedback,
  agentMemories,
  agentOutcomes,
  agentTraces,
  closedLoopMetrics,
  orgEvalSet,
  orgSettings,
  orgThresholds,
  reports,
} from "./schema/closed-loop";
import {
  connectionAlerts,
  dataConnections,
  rawPayloads,
  syncRuns,
} from "./schema/connections";
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
import {
  anomalies,
  flagStatusHistory,
  reconciliationFlags,
} from "./schema/reconciliation";

export const schema = {
  anomalies,
  pages,
  organizations,
  dataConnections,
  connectionAlerts,
  syncRuns,
  rawPayloads,
  dailyMetrics,
  orders,
  orderLineItems,
  payments,
  refunds,
  payouts,
  reconciliationFlags,
  flagStatusHistory,
  agentTraces,
  agentFeedback,
  agentMemories,
  agentOutcomes,
  adCampaigns,
  adMetricsDaily,
  closedLoopMetrics,
  orgEvalSet,
  orgThresholds,
  reports,
  orgSettings,
};

// Lazy-init the connection. Two reasons:
//
//   1. Module-load no longer triggers env validation. Tests that only
//      import types from `@ai-cfo/database` (e.g. `import type {...}`)
//      or that gate behavior on DATABASE_URL via `describe.skipIf`
//      survive without a populated env. Previously every consumer
//      crashed at module load when DATABASE_URL was unset.
//
//   2. Cold-start cost is deferred: Next.js routes that never read
//      from this DB (static pages, image routes, public auth flows)
//      no longer pay the postgres-client construction tax on the
//      import side.
//
// The first `database.<op>()` triggers `getDb()` which validates env,
// constructs the postgres client, caches it on the global, and wraps
// it in drizzle. Subsequent calls reuse the cached instance — same
// pooling behavior as the eager version.
//
// Implementation is a Proxy<drizzle-instance> so the public type
// signature is unchanged.

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = global as unknown as {
  __aiCfoDbClient: postgres.Sql | undefined;
  __aiCfoDrizzle: DrizzleDb | undefined;
};

const getDb = (): DrizzleDb => {
  if (globalForDb.__aiCfoDrizzle) {
    return globalForDb.__aiCfoDrizzle;
  }
  const sql =
    globalForDb.__aiCfoDbClient ??
    postgres(keys().DATABASE_URL, { prepare: false });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__aiCfoDbClient = sql;
  }
  const db = drizzle(sql, { schema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__aiCfoDrizzle = db;
  }
  return db;
};

// biome-ignore lint/suspicious/noExplicitAny: Proxy target placeholder; reads/writes are forwarded to the lazy-resolved drizzle instance
const databaseProxyTarget = {} as any;

export const database: DrizzleDb = new Proxy(databaseProxyTarget, {
  get(_target, prop, receiver) {
    const db = getDb();
    const value = Reflect.get(db as object, prop, receiver);
    // Drizzle methods (`.select()`, `.insert()`, etc.) are typed as
    // properties whose call-time `this` is the drizzle instance, so
    // rebind functions through .bind(db) to preserve method semantics.
    return typeof value === "function" ? value.bind(db) : value;
  },
}) as DrizzleDb;
