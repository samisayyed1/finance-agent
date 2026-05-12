import { Button } from "@ai-cfo/design-system/components/ui/button";
import { MoveRight } from "lucide-react";

/**
 * Final waitlist CTA. Mirrors the mailto wiring on Hero so a visitor
 * who scrolled all the way down has the same single CTA they had
 * above the fold. Zero-infra "waitlist" — body templating gives the
 * brand a head start writing their first message.
 */

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

export const WaitlistCTA = () => (
  <section
    className="border-t bg-gradient-to-b from-background to-muted/40"
    id="waitlist"
  >
    <div className="container mx-auto px-4 py-20 lg:py-32">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
          Design partner cohort · 5 slots · v0
        </p>
        <h2 className="font-regular text-3xl tracking-tighter md:text-5xl">
          Run a brand doing $50k–$2M/mo? Get founding pricing locked in for 12
          months.
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          One Loom call a month. Direct line to the founder. The system shaped
          by what your operator actually needs.
        </p>
        <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-center">
          <Button asChild className="gap-3" size="lg">
            <a href={buildMailto()}>
              Join the waitlist
              <MoveRight className="h-4 w-4" />
            </a>
          </Button>
          <p className="text-muted-foreground text-xs">
            Opens your email composer with a starter draft. No form.
          </p>
        </div>
      </div>
    </div>
  </section>
);
