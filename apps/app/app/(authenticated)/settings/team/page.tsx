/**
 * /settings/team — team membership (via Clerk's OrganizationProfile)
 * + delivery preferences form (org_settings UPSERT).
 */

import { OrganizationProfile } from "@ai-cfo/auth/client";
import { auth } from "@ai-cfo/auth/server";
import { database, eq, orgSettings } from "@ai-cfo/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ai-cfo/design-system/components/ui/card";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DeliveryForm,
  type DeliveryFormDefaults,
} from "./components/delivery-form";

export const metadata: Metadata = {
  title: "Team — AI CFO",
  description: "Members and delivery preferences.",
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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="font-semibold text-2xl">
          Team &amp; delivery preferences
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage members + how the daily report reaches you.
        </p>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Invite teammates and manage roles. Powered by Clerk.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <OrganizationProfile routing="hash" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivery preferences</CardTitle>
            <CardDescription>
              When and where the daily report shows up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeliveryForm defaults={defaults} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeamPage;
