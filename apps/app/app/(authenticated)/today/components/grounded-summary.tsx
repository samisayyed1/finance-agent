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
import type { CitationLookup } from "../data";
import { AnomalyCard, FlagCard, SnapshotCard } from "./citation-cards";
import type { CitationSegment, Segment } from "./citation-parser";
import { parseCitations } from "./citation-parser";

interface GroundedSummaryProps {
  lookup: CitationLookup;
  markdown: string;
}

const CITATION_PILL_CLASS =
  "inline-flex items-center rounded-full border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-help";

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
  seg: CitationSegment;
}

const CitationPill = ({ seg, lookup }: CitationPillProps) => {
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
        <button className={cn(CITATION_PILL_CLASS)} type="button">
          {labelOf(seg)}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        {body}
      </HoverCardContent>
    </HoverCard>
  );
};

const renderSegment = (seg: Segment, i: number, lookup: CitationLookup) => {
  if (seg.kind === "text") {
    return <span key={`t-${i}`}>{seg.text}</span>;
  }
  return <CitationPill key={`c-${i}-${seg.raw}`} lookup={lookup} seg={seg} />;
};

export const GroundedSummary = ({ markdown, lookup }: GroundedSummaryProps) => {
  const segments = parseCitations(markdown);
  return (
    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
      {segments.map((seg, i) => renderSegment(seg, i, lookup))}
    </pre>
  );
};
