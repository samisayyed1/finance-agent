/**
 * "How it works" / The Mechanism section. Two principles, two cards.
 * Iron Rule #1 (no AI-computed numbers) + Iron Rule #6 (every numeric
 * token is grounded) are the moat — telling the visitor that out loud
 * is what differentiates this from "another AI dashboard."
 */
export const Mechanism = () => (
  <section className="border-t bg-muted/30" id="how-it-works">
    <div className="container mx-auto px-4 py-20 lg:py-32">
      <div className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
          The mechanism
        </p>
        <h2 className="font-regular text-3xl tracking-tighter md:text-5xl">
          Two rules. The numbers come from somewhere auditable.
        </h2>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-2">
        <article className="flex flex-col gap-4 rounded-2xl border bg-background p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted font-mono font-semibold text-xs">
              1
            </div>
            <h3 className="font-semibold text-lg tracking-tight">
              The AI never computes a number
            </h3>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Every metric — revenue, ROAS, refund rate, contribution profit —
            lives in a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
              metrics
            </code>{" "}
            package with cent-exact tests against the actual Stripe and Shopify
            fee schedules. Dinero.js, not raw floats. The model only narrates
            what SQL already proved.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border bg-background p-4 font-mono text-[11px] text-muted-foreground leading-relaxed">
            {`// packages/metrics/src/revenue.ts
test("revenue_net = gross − refunds − fees", () => {
  expect(revenueNet({
    gross: 100_00n,   // $100.00
    refunds: 12_50n,  //  $12.50
    fees:    3_20n,   //   $3.20
  })).toBe(84_30n);   //  $84.30
});`}
          </pre>
        </article>

        <article className="flex flex-col gap-4 rounded-2xl border bg-background p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted font-mono font-semibold text-xs">
              2
            </div>
            <h3 className="font-semibold text-lg tracking-tight">
              The agent can't ship a number without citing a row
            </h3>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Every numeric token in agent output carries an inline citation
            marker —{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
              [snapshot:&lt;id&gt;]
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
              [anomaly:&lt;id&gt;]
            </code>
            , or{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
              [flag:&lt;id&gt;]
            </code>
            . A grounding validator parses the output at the renderer boundary
            and rejects any token that doesn't trace back to a tool call. The
            model literally cannot ship a number it didn't get from the
            database.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border bg-background p-4 font-mono text-[11px] text-muted-foreground leading-relaxed">
            {`// Agent prose (rejected)
"Revenue was $42,000 today."

// Agent prose (accepted, hover any pill)
"Revenue was $42,000 [snapshot:s-abc123]
 — up 12% vs 7-day average [snapshot:s-prior]."`}
          </pre>
        </article>
      </div>
    </div>
  </section>
);
