"use client";

/**
 * Standalone HoverCard pill exposing the underlying `daily_metrics`
 * snapshot row for a given snapshot id. Used by the HeadlineCard on
 * `/today` so the operator can hover-verify the trust story without
 * needing the AI summary to be present.
 *
 * Pairs with the inline citation pills inside `<GroundedSummary>`. Both
 * surfaces reuse the SnapshotCard body so the hover content stays
 * consistent across the page.
 */

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@ai-cfo/design-system/components/ui/hover-card";
import { cn } from "@ai-cfo/design-system/lib/utils";
import type { SnapshotLookupRow } from "../data";
import { SnapshotCard } from "./citation-cards";

interface SnapshotPillProps {
  row: SnapshotLookupRow | null;
  snapshotId: string;
}

const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-help";

export const SnapshotPill = ({ snapshotId, row }: SnapshotPillProps) => {
  // No matching row → fall back to the existing static `snapshot:<id>`
  // mono label so the surface stays honest without crashing.
  if (!row) {
    return (
      <p className="font-mono text-muted-foreground text-xs">
        snapshot:{snapshotId}
      </p>
    );
  }

  return (
    <HoverCard closeDelay={120} openDelay={120}>
      <HoverCardTrigger asChild>
        <button className={cn(PILL_CLASS)} type="button">
          <span>snap</span>
          <span className="opacity-50">·</span>
          <span className="truncate text-[10px] normal-case tracking-normal">
            {snapshotId.slice(0, 8)}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <SnapshotCard row={row} />
      </HoverCardContent>
    </HoverCard>
  );
};
