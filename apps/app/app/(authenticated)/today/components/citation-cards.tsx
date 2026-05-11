/**
 * Shared HoverCard body components for the Iron-Rule-#6 citation surfaces
 * on /today. Both the inline citation pills inside the AI summary and
 * the standalone snapshot pill on the HeadlineCard consume these so the
 * grounding evidence stays consistent across the page.
 *
 * Pure presentation — no client hooks, safe to import from server
 * components for prefetch or inline rendering.
 */

import type {
  AnomalyLookupRow,
  FlagLookupRow,
  SnapshotLookupRow,
} from "../data";

export const SnapshotCard = ({ row }: { row: SnapshotLookupRow }) => (
  <div className="space-y-1 text-sm">
    <p className="font-medium">Daily snapshot · {row.date}</p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {row.revenueNet ? (
        <>
          <dt>Revenue net</dt>
          <dd className="text-right font-mono text-foreground">
            {row.revenueNet}
          </dd>
        </>
      ) : null}
      {row.revenueGross ? (
        <>
          <dt>Revenue gross</dt>
          <dd className="text-right font-mono text-foreground">
            {row.revenueGross}
          </dd>
        </>
      ) : null}
      {row.roas ? (
        <>
          <dt>ROAS</dt>
          <dd className="text-right font-mono text-foreground">{row.roas}</dd>
        </>
      ) : null}
      {row.orders !== null ? (
        <>
          <dt>Orders</dt>
          <dd className="text-right font-mono text-foreground">{row.orders}</dd>
        </>
      ) : null}
    </dl>
    <p className="pt-1 font-mono text-[10px] text-muted-foreground">
      snapshot:{row.snapshotId}
    </p>
  </div>
);

export const AnomalyCard = ({ row }: { row: AnomalyLookupRow }) => (
  <div className="space-y-1 text-sm">
    <p className="font-medium">
      Anomaly · {row.metric} · {row.severity}
    </p>
    <p className="text-muted-foreground text-xs">Date: {row.date}</p>
    {row.value ? (
      <p className="text-muted-foreground text-xs">
        Current value:{" "}
        <span className="font-mono text-foreground">{row.value}</span>
      </p>
    ) : null}
    {row.suggestedCause ? (
      <p className="pt-1 text-foreground text-xs">{row.suggestedCause}</p>
    ) : null}
    <p className="pt-1 font-mono text-[10px] text-muted-foreground">
      anomaly:{row.anomalyId}
    </p>
  </div>
);

export const FlagCard = ({ row }: { row: FlagLookupRow }) => (
  <div className="space-y-1 text-sm">
    <p className="font-medium">
      {row.kind} · {row.status}
    </p>
    {row.delta ? (
      <p className="text-muted-foreground text-xs">
        Δ <span className="font-mono text-foreground">{row.delta}</span>
      </p>
    ) : null}
    <p className="text-muted-foreground text-xs">
      Opened: {row.createdAt.toISOString().slice(0, 10)}
    </p>
    <p className="pt-1 font-mono text-[10px] text-muted-foreground">
      flag:{row.flagId}
    </p>
  </div>
);
