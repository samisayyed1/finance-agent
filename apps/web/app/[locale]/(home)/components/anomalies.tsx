/**
 * "What it catches" section — the six baked-in anomalies from the
 * Maeve Co. demo dataset. These are real things the system flags;
 * showing them here grounds the visitor in concrete operator pain
 * instead of abstract "AI" handwaving.
 *
 * Mirrors docs/PLANS/day-8-demo-data-seeder.md § Anomaly catalog.
 */

const ANOMALIES = [
  {
    label: "Meta attribution drift",
    detail:
      "Meta over-reports conversions by ~30% for a week (iOS gap simulation). The reconcile package emits ATTRIBUTION_MISMATCH flags so the operator sees the drift instead of paying for it.",
    impact: "$8,200 over-attributed",
  },
  {
    label: "Meta broad-audience ROAS collapse",
    detail:
      "A broad-audience campaign degrades from 4.1× to 1.8× ROAS over seven days. The anomaly job emits a high-severity roas event before the operator's normal weekly review would catch it.",
    impact: "ROAS −56%",
  },
  {
    label: "Refund spike from a defective batch",
    detail:
      "Three consecutive days at 6× normal refund count. The agent narrates the defect window with a grounded link to every refund — not just an aggregate.",
    impact: "+$3,420 refunds",
  },
  {
    label: "Organic new-customer surge",
    detail:
      "A press mention triples order count for one day. new_customers spikes; cohort analysis surfaces the channel without the operator having to ask.",
    impact: "+212 new customers",
  },
  {
    label: "Stripe payout gap",
    detail:
      "A payout's expected_arrival_at shifts three business days. Cashflow planning gets a heads-up the morning it happens, not when the cash doesn't show up.",
    impact: "$31,400 delayed",
  },
  {
    label: "Orders missing Stripe charges",
    detail:
      "Eight orders ship with no matching Stripe charge (~$1,847 of revenue at risk). Reconcile package emits ORDER_MISSING_PAYMENT flags; the operator bulk-resolves with one click.",
    impact: "$1,847 at risk",
  },
];

export const Anomalies = () => (
  <section className="border-t" id="anomalies">
    <div className="container mx-auto px-4 py-20 lg:py-32">
      <div className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
          What it catches
        </p>
        <h2 className="font-regular text-3xl tracking-tighter md:text-5xl">
          Six things you'd otherwise find out by accident.
        </h2>
        <p className="mx-auto max-w-2xl pt-2 text-lg text-muted-foreground leading-relaxed">
          The Maeve Co. demo dataset ships with these six baked in. Real
          customer data surfaces the same shapes within the first 30 days.
        </p>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ANOMALIES.map((a) => (
          <article
            className="flex flex-col gap-3 rounded-xl border bg-background p-6"
            key={a.label}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-base tracking-tight">
                {a.label}
              </h3>
              <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                {a.impact}
              </span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {a.detail}
            </p>
          </article>
        ))}
      </div>
    </div>
  </section>
);
