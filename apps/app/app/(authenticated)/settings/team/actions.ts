"use server";

/**
 * Server action for /settings/team. UPSERTs org_settings under the
 * caller's org_id; RLS prevents cross-tenant writes.
 */

import { auth } from "@ai-cfo/auth/server";
import { database, orgSettings, sql } from "@ai-cfo/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const HHMM_ONLY_RE = /^\d{2}:\d{2}$/;

const DeliverySettingsSchema = z.object({
  dailyReportTime: z.string().regex(TIME_RE),
  dailyReportTimezone: z.string().min(1).max(64),
  deliveryEmailEnabled: z.boolean(),
  deliverySlackEnabled: z.boolean(),
  deliveryWhatsappEnabled: z.boolean(),
  monthlyPdfEnabled: z.boolean(),
  slackChannelId: z.string().max(64).optional().nullable(),
  whatsappNumber: z.string().max(32).optional().nullable(),
});

export type DeliverySettingsInput = z.infer<typeof DeliverySettingsSchema>;

export interface UpdateOrgSettingsResult {
  readonly error?: string;
  readonly ok: boolean;
}

const normalizeTime = (raw: string): string => {
  // HTML <input type="time"> emits HH:MM; the column expects HH:MM:SS.
  if (HHMM_ONLY_RE.test(raw)) {
    return `${raw}:00`;
  }
  return raw;
};

export const updateOrgSettings = async (
  raw: unknown
): Promise<UpdateOrgSettingsResult> => {
  const { orgId } = await auth();
  if (!orgId) {
    return { ok: false, error: "unauthorized" };
  }
  const parsed = DeliverySettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  const v = parsed.data;
  try {
    await database
      .insert(orgSettings)
      .values({
        orgId,
        dailyReportTime: normalizeTime(v.dailyReportTime),
        dailyReportTimezone: v.dailyReportTimezone,
        deliveryEmailEnabled: v.deliveryEmailEnabled,
        deliverySlackEnabled: v.deliverySlackEnabled,
        deliveryWhatsappEnabled: v.deliveryWhatsappEnabled,
        slackChannelId: v.slackChannelId ?? null,
        whatsappNumber: v.whatsappNumber ?? null,
        monthlyPdfEnabled: v.monthlyPdfEnabled,
      })
      .onConflictDoUpdate({
        target: orgSettings.orgId,
        set: {
          dailyReportTime: normalizeTime(v.dailyReportTime),
          dailyReportTimezone: v.dailyReportTimezone,
          deliveryEmailEnabled: v.deliveryEmailEnabled,
          deliverySlackEnabled: v.deliverySlackEnabled,
          deliveryWhatsappEnabled: v.deliveryWhatsappEnabled,
          slackChannelId: v.slackChannelId ?? null,
          whatsappNumber: v.whatsappNumber ?? null,
          monthlyPdfEnabled: v.monthlyPdfEnabled,
          updatedAt: sql`now()`,
        },
      });
    revalidatePath("/settings/team");
    return { ok: true };
  } catch {
    return { ok: false, error: "persist_failed" };
  }
};
