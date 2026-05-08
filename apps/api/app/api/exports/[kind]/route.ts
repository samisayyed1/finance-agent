/**
 * GET /api/exports/{kind} — RLS-scoped CSV/XLSX downloads.
 *
 * Supported kinds:
 *   - metrics-csv      : daily_metrics for the last `range` days (default 90)
 *   - metrics-xlsx     : same, as XLSX
 *   - flags-csv        : reconciliation_flags (all statuses, ordered by createdAt)
 *   - anomalies-csv    : anomalies (ordered by createdAt desc)
 *
 * Iron-rule echoes:
 *   #2 — every query carries `eq(table.orgId, orgId)` defensively
 *        even though Drizzle injects the JWT-derived RLS predicate.
 *   #4 — exports are projections of normalized data; the raw payloads
 *        in R2 remain immutable and unaffected.
 *   pino logging with row counts + kind so we can audit.
 */

import { auth } from "@ai-cfo/auth/server";
import {
  and,
  anomalies,
  asc,
  dailyMetrics,
  database,
  desc,
  eq,
  gte,
  reconciliationFlags,
} from "@ai-cfo/database";
import Papa from "papaparse";
import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";
import { z } from "zod";
import { logger } from "../../../lib/logger";

const KindSchema = z.enum([
  "metrics-csv",
  "metrics-xlsx",
  "flags-csv",
  "anomalies-csv",
]);
type Kind = z.infer<typeof KindSchema>;

const DEFAULT_RANGE_DAYS = 90;
const MAX_RANGE_DAYS = 365;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const subDays = (d: Date, days: number): Date => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - days);
  return out;
};

const parseRange = (raw: string | null): number => {
  if (!raw) {
    return DEFAULT_RANGE_DAYS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_RANGE_DAYS;
  }
  return Math.min(n, MAX_RANGE_DAYS);
};

const csvResponse = (rows: unknown[], filename: string): Response => {
  const csv = Papa.unparse(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};

const xlsxResponse = (rows: unknown[], filename: string): Response => {
  // biome-ignore lint/suspicious/noExplicitAny: xlsx accepts json_to_sheet input as object[] — Drizzle row shape is structurally compatible
  const ws = xlsxUtils.json_to_sheet(rows as any[]);
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, "Sheet1");
  const buffer = xlsxWrite(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};

const fetchMetrics = async (
  orgId: string,
  rangeDays: number
): Promise<unknown[]> => {
  const cutoff = isoDate(subDays(new Date(), rangeDays));
  const rows = await database
    .select()
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.orgId, orgId), gte(dailyMetrics.date, cutoff)))
    .orderBy(asc(dailyMetrics.date));
  return rows;
};

const fetchFlags = async (orgId: string): Promise<unknown[]> => {
  const rows = await database
    .select()
    .from(reconciliationFlags)
    .where(eq(reconciliationFlags.orgId, orgId))
    .orderBy(desc(reconciliationFlags.createdAt));
  return rows;
};

const fetchAnomalies = async (orgId: string): Promise<unknown[]> => {
  const rows = await database
    .select()
    .from(anomalies)
    .where(eq(anomalies.orgId, orgId))
    .orderBy(desc(anomalies.createdAt));
  return rows;
};

interface RouteContext {
  params: Promise<{ kind: string }>;
}

export const GET = async (
  req: Request,
  ctx: RouteContext
): Promise<Response> => {
  const { orgId } = await auth();
  if (!orgId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { kind: rawKind } = await ctx.params;
  const parsed = KindSchema.safeParse(rawKind);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_kind" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const kind: Kind = parsed.data;

  const url = new URL(req.url);
  const rangeDays = parseRange(url.searchParams.get("range"));
  const today = isoDate(new Date());

  let rows: unknown[];
  let response: Response;
  if (kind === "metrics-csv") {
    rows = await fetchMetrics(orgId, rangeDays);
    response = csvResponse(rows, `metrics-${today}.csv`);
  } else if (kind === "metrics-xlsx") {
    rows = await fetchMetrics(orgId, rangeDays);
    response = xlsxResponse(rows, `metrics-${today}.xlsx`);
  } else if (kind === "flags-csv") {
    rows = await fetchFlags(orgId);
    response = csvResponse(rows, `flags-${today}.csv`);
  } else {
    rows = await fetchAnomalies(orgId);
    response = csvResponse(rows, `anomalies-${today}.csv`);
  }

  logger.info(
    { orgId, kind, rowCount: rows.length, rangeDays },
    "export delivered"
  );
  return response;
};
