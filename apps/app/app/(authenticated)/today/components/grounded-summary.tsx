"use client";

/**
 * Renders the AI summary markdown with interactive citation pills.
 *
 * Iron Rule #6 (grounding): every numeric token in agent prose carries an
 * inline `[snapshot:<id>]` / `[anomaly:<id>]` / `[flag:<id>]` marker, and
 * the validator rejects ungrounded output before it reaches this surface.
 * This component:
 *   - parses the markdown into text + citation segments
 *   - renders citations as pill-shaped HoverCard triggers
 *   - shows the underlying row's key fields on hover
 *
 * Citations whose underlying row is missing from the lookup map (e.g. the
 * flag was resolved-and-purged between report write and render) fall
 * through to plain monospace text — the render path never crashes on a
 * stale id.
 */

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@ai-cfo/design-system/components/ui/hover-card";
import { cn } from "@ai-cfo/design-system/lib/utils";
import { useState } from "react";
import type { CitationLookup } from "../data";
import { AnomalyCard, FlagCard, SnapshotCard } from "./citation-cards";
import type { CitationSegment, Segment } from "./citation-parser";
import { parseCitations } from "./citation-parser";
import { ReceiptDrawer } from "./receipt-drawer";

interface GroundedSummaryProps {
  lookup: CitationLookup;
  markdown: string;
}

// Day-11 Stitch receipt-pill spec: a typographically considered inline
// component, NOT a hyperlink. 22px tall, 6px radius (slight round, not
// full pill — full-pill inline reads cheap), 1px hairline border at 8%,
// background at 4% surface tint, JetBrains Mono medium 12px, tabular-nums.
const CITATION_PILL_CLASS =
  "inline-flex h-[22px] items-baseline rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-2 align-baseline font-mono font-medium text-[12px] text-zinc-100 tabular-nums leading-[20px] cursor-help transition-colors hover:border-white/[0.16] hover:bg-white/[0.08]";

const labelOf = (seg: CitationSegment): string => {
  if (seg.citationKind === "snapshot") {
    return "snap";
  }
  if (seg.citationKind === "anomaly") {
    return "anom";
  }
  if (seg.citationKind === "flag") {
    return "flag";
  }
  return "mem";
};

interface CitationPillProps {
  lookup: CitationLookup;
  onOpenReceipt: (seg: CitationSegment) => void;
  seg: CitationSegment;
}

const CitationPill = ({ seg, lookup, onOpenReceipt }: CitationPillProps) => {
  let body: React.ReactNode = null;
  if (seg.citationKind === "snapshot") {
    const row = lookup.snapshots[seg.id];
    if (row) {
      body = <SnapshotCard row={row} />;
    }
  } else if (seg.citationKind === "anomaly") {
    const row = lookup.anomalies[seg.id];
    if (row) {
      body = <AnomalyCard row={row} />;
    }
  } else if (seg.citationKind === "flag") {
    const row = lookup.flags[seg.id];
    if (row) {
      body = <FlagCard row={row} />;
    }
  }

  // No matching row → render the raw token monospace, no popover. Keeps
  // the surface honest about stale-id cases without crashing.
  if (!body) {
    return (
      <span className="font-mono text-muted-foreground text-xs">{seg.raw}</span>
    );
  }

  return (
    <HoverCard closeDelay={120} openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          className={cn(CITATION_PILL_CLASS)}
          onClick={() => onOpenReceipt(seg)}
          type="button"
        >
          {labelOf(seg)}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        {body}
      </HoverCardContent>
    </HoverCard>
  );
};

const renderSegment = (
  seg: Segment,
  i: number,
  lookup: CitationLookup,
  onOpenReceipt: (seg: CitationSegment) => void
) => {
  if (seg.kind === "text") {
    return <span key={`t-${i}`}>{seg.text}</span>;
  }
  return (
    <CitationPill
      key={`c-${i}-${seg.raw}`}
      lookup={lookup}
      onOpenReceipt={onOpenReceipt}
      seg={seg}
    />
  );
};

export const GroundedSummary = ({ markdown, lookup }: GroundedSummaryProps) => {
  const segments = parseCitations(markdown);
  const [openSeg, setOpenSeg] = useState<CitationSegment | null>(null);

  // Build a friendly title for the receipt drawer from the citation kind.
  // For Day-12 we surface the segment's raw monetary token if one is
  // available adjacent to it; otherwise we fall back to a generic label.
  const drawerTitle = (() => {
    if (!openSeg) {
      return "Receipt";
    }
    if (openSeg.citationKind === "snapshot") {
      const row = lookup.snapshots[openSeg.id];
      return row?.revenueNet ?? row?.revenueGross ?? "$0.00";
    }
    if (openSeg.citationKind === "flag") {
      const row = lookup.flags[openSeg.id];
      return row?.delta ?? `Flag · ${openSeg.id.slice(0, 8)}`;
    }
    if (openSeg.citationKind === "anomaly") {
      const row = lookup.anomalies[openSeg.id];
      return row?.value ?? `Anomaly · ${openSeg.id.slice(0, 8)}`;
    }
    return openSeg.id;
  })();

  return (
    <>
      <p className="text-inherit">
        {segments.map((seg, i) => renderSegment(seg, i, lookup, setOpenSeg))}
      </p>
      <ReceiptDrawer
        onClose={() => setOpenSeg(null)}
        open={openSeg !== null}
        title={drawerTitle}
      />
    </>
  );
};
