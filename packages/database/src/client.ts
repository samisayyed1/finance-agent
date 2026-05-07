import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { keys } from "../keys";
import { pages } from "./schema/pages";

export const schema = { pages };

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
