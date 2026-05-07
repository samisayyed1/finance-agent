import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { keys } from "../keys";
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
import { reconciliationFlags } from "./schema/reconciliation";

export const schema = {
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
