import { MailIcon, MessageSquareIcon, PhoneIcon } from "lucide-react";

/**
 * "Where it lives" section. Iron Rule #7: the product lives in
 * operator surfaces, not in a dashboard. Showing email + Slack +
 * WhatsApp explicitly is what differentiates this from a Tableau-shaped
 * "log in to see your numbers" pitch.
 */

const SURFACES = [
  {
    icon: MailIcon,
    label: "Email",
    detail:
      "Every morning at 7am local time. Grounded narrative, dollar deltas, recommendations you approve. Reply to flag — that signal trains the system for your brand only.",
  },
  {
    icon: MessageSquareIcon,
    label: "Slack",
    detail:
      "Block Kit messages in your operator channel. Thumbs-up to approve a recommendation, thumbs-down to teach the system it was wrong. Buttons keyed by trace_id — every interaction becomes labeled training data scoped to your org.",
  },
  {
    icon: PhoneIcon,
    label: "WhatsApp",
    detail:
      "Daily summary delivered to a phone number you control. Designed for founders who live on WhatsApp. Reply-to-action coming Q3.",
  },
];

export const WhereItLives = () => (
  <section className="border-t bg-muted/30">
    <div className="container mx-auto px-4 py-20 lg:py-32">
      <div className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
          Where it lives
        </p>
        <h2 className="font-regular text-3xl tracking-tighter md:text-5xl">
          In your inbox. In Slack. The dashboard is the diagnostic layer.
        </h2>
        <p className="mx-auto max-w-2xl pt-2 text-lg text-muted-foreground leading-relaxed">
          A CFO who only speaks when you log into them isn't a CFO. We push, you
          don't pull.
        </p>
      </div>

      <div className="mt-16 grid gap-4 lg:grid-cols-3">
        {SURFACES.map((s) => {
          const Icon = s.icon;
          return (
            <article
              className="flex flex-col gap-4 rounded-2xl border bg-background p-8"
              key={s.label}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg tracking-tight">
                {s.label}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {s.detail}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  </section>
);
