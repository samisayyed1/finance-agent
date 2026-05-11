import { Button } from "@ai-cfo/design-system/components/ui/button";
import type { Dictionary } from "@ai-cfo/internationalization";
import { MoveRight } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";

interface HeroProps {
  dictionary: Dictionary;
}

const WAITLIST_EMAIL = "scout@maevemodels.co.uk";
const WAITLIST_SUBJECT = "AI Operating CFO — design partner waitlist";
const WAITLIST_BODY = [
  "Hey Sami,",
  "",
  "I run an ecommerce brand doing ~$<MONTHLY REVENUE>/month, primarily on",
  "Shopify + Stripe with Meta + Google ad spend. I'd like to be considered",
  "for the design partner cohort.",
  "",
  "A bit about us:",
  "  - <BRAND>",
  "  - <CATEGORY>",
  "  - <WHAT YOU CARE ABOUT>",
  "",
  "— <YOUR NAME>",
].join("\n");

const buildMailto = (): string => {
  const params = new URLSearchParams({
    subject: WAITLIST_SUBJECT,
    body: WAITLIST_BODY,
  });
  return `mailto:${WAITLIST_EMAIL}?${params.toString()}`;
};

// Dictionary prop is kept to preserve the public Hero signature used by
// the [locale]/(home)/page.tsx route — design-partner stage ships English
// only and the dictionary is unread.
// biome-ignore lint/correctness/noUnusedFunctionParameters: signature parity
export const Hero = ({ dictionary }: HeroProps) => {
  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex flex-col items-center justify-center gap-10 py-20 lg:py-32">
          <div className="rounded-full border bg-muted/50 px-3 py-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
            v0 · invite-only design partners
          </div>

          <div className="flex flex-col gap-6">
            <h1 className="max-w-3xl text-center font-regular text-5xl tracking-tighter md:text-6xl lg:text-7xl">
              An AI CFO that <span className="italic">can't ship a number</span>{" "}
              without citing the database row.
            </h1>
            <p className="mx-auto max-w-2xl text-center text-lg text-muted-foreground leading-relaxed tracking-tight md:text-xl">
              Refund spikes, attribution drift, missing Stripe charges — caught
              the morning after, every dollar grounded to a row you can audit.
              Lives in your inbox and Slack. Dashboard is the diagnostic layer.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild className="gap-3" size="lg">
              <a href={buildMailto()}>
                Join the design partner waitlist
                <MoveRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild className="gap-3" size="lg" variant="outline">
              <Link href={env.NEXT_PUBLIC_APP_URL}>
                Sign in
                <MoveRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mx-auto max-w-3xl space-y-2 pt-6 text-center text-muted-foreground text-sm">
            <p>
              Connectors live: Shopify, Stripe, Meta, Google. Slack delivery +
              Resend email + WhatsApp on the roadmap. QuickBooks / Xero / Plaid
              next quarter.
            </p>
            <p className="text-xs">
              Currently onboarding 3–5 brands at $50k–$2M/mo for the
              founding-design-partner cohort.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
