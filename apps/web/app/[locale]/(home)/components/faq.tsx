import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ai-cfo/design-system/components/ui/accordion";

const QUESTIONS = [
  {
    q: "How is this different from Glassbox, Polar, or Tabby?",
    a: "Most ecommerce analytics tools dashboard your data and stop there. We do two things they don't: cent-exact reconciliation (your numbers match Stripe's payouts to the penny because we wrote unit tests against the actual fee schedules) and grounded AI narrative (every number the agent emits cites the database row it came from — no hallucinated metrics, ever). Day-N+ we extend to QuickBooks + Xero + Plaid for the operator-CFO surface.",
  },
  {
    q: "Do you train models on my data?",
    a: "No. Cross-tenant data pooling is forbidden by construction — every memory, feedback signal, and outcome is scoped by org_id with Postgres row-level-security policies. The closed-loop that improves grounding rate, feature recall, and outcome accuracy runs per-org, in isolation. We can prove this with a SQL audit on request.",
  },
  {
    q: "What if the AI is wrong?",
    a: "Two safeguards. First, the grounding validator rejects ungrounded reports at the renderer boundary — the model literally cannot ship a number it didn't get from a tool call. Second, recommendations are humans-approve-first by design; no automated budget changes, no automated customer emails, no irreversible action without a click.",
  },
  {
    q: "Which connectors are live today?",
    a: "Shopify (full OAuth + webhooks + reconcile), Stripe (full Connect OAuth + webhooks + payout reconcile), Meta Ads, Google Ads, Slack delivery, Resend email, and a WhatsApp delivery surface. QuickBooks, Xero, and Plaid are on the roadmap for the universal-extensible vision.",
  },
  {
    q: "Who's the customer? Brand or agency?",
    a: "Both — the architecture is multi-tenant from day one, so an agency can manage multiple client brands under one parent. Our wedge is $50k–$2M/mo Shopify brands and the agencies serving them. White-labeling, per-client billing routing, and an agency-level dashboard ship in the agency tier.",
  },
  {
    q: "What does 'design partner' mean?",
    a: "We onboard a small cohort of brands and agencies at founding pricing (locked in for 12 months) in exchange for direct feedback and a Loom-call-per-month cadence. You get the system at a discount; we get your operator instincts shaping the roadmap. Cap is 5 design partners total for v1.",
  },
];

export const FAQ = () => (
  <section className="border-t" id="faq">
    <div className="container mx-auto px-4 py-20 lg:py-32">
      <div className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
          Questions
        </p>
        <h2 className="font-regular text-3xl tracking-tighter md:text-5xl">
          The questions operators actually ask.
        </h2>
      </div>

      <div className="mx-auto mt-12 max-w-3xl">
        <Accordion className="w-full" collapsible type="single">
          {QUESTIONS.map((item, i) => (
            <AccordionItem key={item.q} value={`q-${i}`}>
              <AccordionTrigger className="text-left font-medium text-base">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </section>
);
