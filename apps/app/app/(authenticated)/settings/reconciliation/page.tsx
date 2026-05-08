/**
 * /settings/reconciliation — operator's dashboard for reconciliation flags.
 *
 * Day-6 ship: server-rendered list with filters (kind / severity / status /
 * date range) and pagination. Per-row inline actions and bulk-select are
 * delegated to the client component below; the server action lives in
 * ./actions.ts and is the only write surface.
 */

import { auth } from "@ai-cfo/auth/server";
import {
  and,
  database,
  desc,
  eq,
  gte,
  lt,
  reconciliationFlags,
} from "@ai-cfo/database";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ai-cfo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlagList } from "./components/flag-list";

export const metadata: Metadata = {
  title: "Reconciliation — AI CFO",
  description:
    "Review and resolve reconciliation flags from your connected sources.",
};

const PAGE_SIZE = 50;

interface SearchParams {
  end?: string;
  kind?: string;
  page?: string;
  start?: string;
  status?: string;
}

const parseSearchParams = (
  raw: Record<string, string | string[] | undefined>
): SearchParams => ({
  kind: typeof raw.kind === "string" ? raw.kind : undefined,
  status: typeof raw.status === "string" ? raw.status : undefined,
  page: typeof raw.page === "string" ? raw.page : undefined,
  start: typeof raw.start === "string" ? raw.start : undefined,
  end: typeof raw.end === "string" ? raw.end : undefined,
});

const ReconciliationPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }
  const params = parseSearchParams(await searchParams);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const filters = [eq(reconciliationFlags.orgId, orgId)];
  if (params.kind) {
    filters.push(eq(reconciliationFlags.kind, params.kind));
  }
  if (params.status) {
    filters.push(eq(reconciliationFlags.status, params.status));
  }
  if (params.start) {
    filters.push(gte(reconciliationFlags.createdAt, new Date(params.start)));
  }
  if (params.end) {
    filters.push(lt(reconciliationFlags.createdAt, new Date(params.end)));
  }

  const flags = await database
    .select()
    .from(reconciliationFlags)
    .where(and(...filters))
    .orderBy(desc(reconciliationFlags.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Reconciliation</h1>
        <p className="text-muted-foreground text-sm">
          Drift between systems. Resolve, dismiss, snooze (7 days), or mark for
          investigation. Every status change is audited in
          <code className="mx-1">flag_status_history</code>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {flags.length} flag{flags.length === 1 ? "" : "s"}
            {params.kind ? ` · kind=${params.kind}` : ""}
            {params.status ? ` · status=${params.status}` : ""}
            {page > 1 ? ` · page ${page}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No flags match this filter. Either you have great data hygiene or
              the filter is too narrow.
            </p>
          ) : (
            <FlagList flags={flags} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReconciliationPage;
