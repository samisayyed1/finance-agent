/**
 * /settings/team — Day-11 Cockpit port from Stitch screen 4865…76b.
 *
 * Real Clerk OrganizationProfile is rendered inline (members list +
 * invite flow), wrapped in the Cockpit chrome: settings sub-nav,
 * page header in the Cockpit voice, delivery-preferences card
 * preserved from the Day-7 version.
 */

import { OrganizationProfile } from "@ai-cfo/auth/client";
import { auth } from "@ai-cfo/auth/server";
import { database, eq, orgSettings } from "@ai-cfo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsSubNav } from "../components/settings-sub-nav";
import {
  DeliveryForm,
  type DeliveryFormDefaults,
} from "./components/delivery-form";

export const metadata: Metadata = {
  title: "Team",
  description: "Add operators or accountants. Wire up your daily briefings.",
};

const DEFAULTS: DeliveryFormDefaults = {
  dailyReportTime: "07:00:00",
  dailyReportTimezone: "America/New_York",
  deliveryEmailEnabled: true,
  deliverySlackEnabled: false,
  deliveryWhatsappEnabled: false,
  monthlyPdfEnabled: true,
  slackChannelId: "",
  whatsappNumber: "",
};

const fetchSettings = async (orgId: string): Promise<DeliveryFormDefaults> => {
  const rows = await database
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return DEFAULTS;
  }
  return {
    dailyReportTime: row.dailyReportTime,
    dailyReportTimezone: row.dailyReportTimezone,
    deliveryEmailEnabled: row.deliveryEmailEnabled,
    deliverySlackEnabled: row.deliverySlackEnabled,
    deliveryWhatsappEnabled: row.deliveryWhatsappEnabled,
    monthlyPdfEnabled: row.monthlyPdfEnabled,
    slackChannelId: row.slackChannelId ?? "",
    whatsappNumber: row.whatsappNumber ?? "",
  };
};

const TeamPage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    redirect("/sign-in");
  }
  const defaults = await fetchSettings(orgId);

  return (
    <div className="mx-auto max-w-[880px] px-[64px] pt-[96px] pb-32">
      <p className="mb-3 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        SETTINGS · TEAM
      </p>
      <h1 className="mb-3 font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
        Your team
      </h1>
      <p className="max-w-[540px] text-[15px] text-zinc-400 leading-[1.6]">
        Add operators or accountants who can read your briefings. We sync
        per-seat permissions back to your Clerk Organization.
      </p>

      <div className="mt-12 mb-10">
        <SettingsSubNav active="team" />
      </div>

      <section className="mb-20">
        <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-[-0.01em]">
          Members
        </h2>
        {/* Clerk's OrganizationProfile retains its own internal layout;
            we host it inside a Cockpit card so its chrome (Clerk's
            default) doesn't fight the surrounding restraint. */}
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#111114]">
          <OrganizationProfile routing="hash" />
        </div>
      </section>

      <section>
        <h2 className="mb-6 font-medium text-[15px] text-zinc-100 tracking-[-0.01em]">
          Daily briefing delivery
        </h2>
        <p className="mb-6 max-w-[540px] text-[13px] text-zinc-400">
          When and where the daily report shows up. Email + Slack + WhatsApp.
        </p>
        <div className="rounded-lg border border-white/[0.06] bg-[#111114] p-6">
          <DeliveryForm defaults={defaults} />
        </div>
      </section>
    </div>
  );
};

export default TeamPage;
