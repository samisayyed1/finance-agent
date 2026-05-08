"use client";

/**
 * Delivery preferences form for /settings/team. Server-side state
 * lives in `org_settings`; this component owns only ephemeral edit
 * state. Submit calls the `updateOrgSettings` server action.
 */

import { Button } from "@ai-cfo/design-system/components/ui/button";
import { Input } from "@ai-cfo/design-system/components/ui/input";
import { Label } from "@ai-cfo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-cfo/design-system/components/ui/select";
import { Switch } from "@ai-cfo/design-system/components/ui/switch";
import { type FormEvent, useState, useTransition } from "react";
import { updateOrgSettings } from "../actions";

export interface DeliveryFormDefaults {
  readonly dailyReportTime: string;
  readonly dailyReportTimezone: string;
  readonly deliveryEmailEnabled: boolean;
  readonly deliverySlackEnabled: boolean;
  readonly deliveryWhatsappEnabled: boolean;
  readonly monthlyPdfEnabled: boolean;
  readonly slackChannelId: string;
  readonly whatsappNumber: string;
}

interface DeliveryFormProps {
  readonly defaults: DeliveryFormDefaults;
}

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
] as const;

const HHMM_RE = /^\d{2}:\d{2}/;

export const DeliveryForm = ({ defaults }: DeliveryFormProps) => {
  const [time, setTime] = useState<string>(
    HHMM_RE.exec(defaults.dailyReportTime)?.[0] ?? "07:00"
  );
  const [tz, setTz] = useState<string>(defaults.dailyReportTimezone);
  const [email, setEmail] = useState<boolean>(defaults.deliveryEmailEnabled);
  const [slack, setSlack] = useState<boolean>(defaults.deliverySlackEnabled);
  const [whatsapp, setWhatsapp] = useState<boolean>(
    defaults.deliveryWhatsappEnabled
  );
  const [slackChannelId, setSlackChannelId] = useState<string>(
    defaults.slackChannelId
  );
  const [whatsappNumber, setWhatsappNumber] = useState<string>(
    defaults.whatsappNumber
  );
  const [monthlyPdf, setMonthlyPdf] = useState<boolean>(
    defaults.monthlyPdfEnabled
  );
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateOrgSettings({
        dailyReportTime: time,
        dailyReportTimezone: tz,
        deliveryEmailEnabled: email,
        deliverySlackEnabled: slack,
        deliveryWhatsappEnabled: whatsapp,
        slackChannelId: slackChannelId.trim() || null,
        whatsappNumber: whatsappNumber.trim() || null,
        monthlyPdfEnabled: monthlyPdf,
      });
      setStatus(result.ok ? "saved" : "error");
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="time">Daily report time</Label>
          <Input
            id="time"
            onChange={(e) => setTime(e.target.value)}
            type="time"
            value={time}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tz">Timezone</Label>
          <Select onValueChange={setTz} value={tz}>
            <SelectTrigger id="tz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="email-toggle">Email delivery</Label>
          <Switch
            checked={email}
            id="email-toggle"
            onCheckedChange={setEmail}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="slack-toggle">Slack delivery</Label>
          <Switch
            checked={slack}
            id="slack-toggle"
            onCheckedChange={setSlack}
          />
        </div>
        {slack ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="slack-channel">Slack channel id</Label>
            <Input
              id="slack-channel"
              onChange={(e) => setSlackChannelId(e.target.value)}
              placeholder="C01234567"
              value={slackChannelId}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="whatsapp-toggle">WhatsApp delivery</Label>
          <Switch
            checked={whatsapp}
            id="whatsapp-toggle"
            onCheckedChange={setWhatsapp}
          />
        </div>
        {whatsapp ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp-number">WhatsApp number</Label>
            <Input
              id="whatsapp-number"
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+15555550123"
              value={whatsappNumber}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="monthly-pdf">Monthly PDF report</Label>
          <Switch
            checked={monthlyPdf}
            id="monthly-pdf"
            onCheckedChange={setMonthlyPdf}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {status === "saved" ? "Saved." : null}
          {status === "error" ? "Save failed — try again." : null}
        </p>
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
};
