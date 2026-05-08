"use server";

/**
 * Reconciliation flag status server actions.
 *
 * Atomic transaction: every UPDATE on reconciliation_flags writes a row
 * to flag_status_history under the same transaction so the audit trail
 * never goes out of sync with the live status.
 */

import { auth } from "@ai-cfo/auth/server";
import {
  database,
  flagStatusHistory,
  reconciliationFlags,
  sql,
} from "@ai-cfo/database";
import { z } from "zod";

const StatusSchema = z.enum([
  "open",
  "resolved",
  "dismissed",
  "snoozed",
  "investigating",
]);
export type FlagStatus = z.infer<typeof StatusSchema>;

const ActionSchema = z.enum([
  "resolve",
  "dismiss",
  "snooze",
  "investigate",
  "reopen",
]);
export type FlagBulkAction = z.infer<typeof ActionSchema>;

const ACTION_TO_STATUS: Record<FlagBulkAction, FlagStatus> = {
  resolve: "resolved",
  dismiss: "dismissed",
  snooze: "snoozed",
  investigate: "investigating",
  reopen: "open",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const getOrgIdAndUser = async (): Promise<{
  orgId: string;
  userId: string | null;
}> => {
  const a = await auth();
  if (!a.orgId) {
    throw new Error("unauthorized");
  }
  return {
    orgId: a.orgId,
    userId: typeof a.userId === "string" ? a.userId : null,
  };
};

export interface BulkUpdateInput {
  action: FlagBulkAction;
  flagIds: string[];
  notes?: string;
}

export interface BulkUpdateResult {
  updated: number;
}

export const bulkUpdateFlags = async (
  raw: BulkUpdateInput
): Promise<BulkUpdateResult> => {
  const flagIds = z.array(z.string().min(1)).min(1).max(500).parse(raw.flagIds);
  const action = ActionSchema.parse(raw.action);
  const notes = raw.notes ? raw.notes.slice(0, 1000) : null;
  const newStatus = ACTION_TO_STATUS[action];
  const { orgId, userId } = await getOrgIdAndUser();

  // One transaction: read previous statuses (so the history row carries
  // the prev_status), update, insert history rows. Atomic — concurrent
  // bulk-update on the same flag is serialized by the row-level lock.
  return await database.transaction(async (tx) => {
    const previous = await tx
      .select({
        flagId: reconciliationFlags.flagId,
        status: reconciliationFlags.status,
      })
      .from(reconciliationFlags)
      .where(
        sql`${reconciliationFlags.flagId} = any(${flagIds}) and ${reconciliationFlags.orgId} = ${orgId}`
      );

    if (previous.length === 0) {
      return { updated: 0 };
    }

    const prevByFlag = new Map(previous.map((p) => [p.flagId, p.status]));
    const realFlagIds = previous.map((p) => p.flagId);

    const snoozeUntil =
      action === "snooze" ? new Date(Date.now() + SEVEN_DAYS_MS) : null;

    await tx
      .update(reconciliationFlags)
      .set({
        status: newStatus,
        statusChangedAt: new Date(),
        statusChangedBy: userId ? sqlAsUuid(userId) : null,
        statusNotes: notes,
        snoozeUntil,
      })
      .where(
        sql`${reconciliationFlags.flagId} = any(${realFlagIds}) and ${reconciliationFlags.orgId} = ${orgId}`
      );

    const historyRows = realFlagIds.map((flagId) => ({
      flagId,
      orgId,
      prevStatus: prevByFlag.get(flagId) ?? null,
      newStatus,
      changedBy: userId ? sqlAsUuid(userId) : null,
      changedAt: new Date(),
      notes,
    }));
    await tx.insert(flagStatusHistory).values(historyRows);

    return { updated: realFlagIds.length };
  });
};

/**
 * Clerk user ids look like `user_<base62>` — not a UUID. The audit table
 * accepts uuid (defense in depth: if someone swaps to a uuid auth later
 * this still works) but we don't have the cycles to migrate auth — so
 * for Day-6 we cast non-uuid Clerk ids to NULL rather than corrupt the
 * column. Day-7+ adds a `changed_by_external` text column.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sqlAsUuid = (id: string): string | null => (UUID_RE.test(id) ? id : null);

export const updateFlagStatus = async (input: {
  flagId: string;
  action: FlagBulkAction;
  notes?: string;
}): Promise<BulkUpdateResult> =>
  await bulkUpdateFlags({
    flagIds: [input.flagId],
    action: input.action,
    notes: input.notes,
  });
