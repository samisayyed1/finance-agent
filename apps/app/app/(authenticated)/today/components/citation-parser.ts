/**
 * Citation parser for the `/today` AI summary card.
 *
 * Tokenises markdown emitted by the daily-report agent into a stream of
 * `text` and `citation` segments. The regex mirrors
 * `packages/agent/src/grounding/validator.ts:CITATION_MARKER_RE` so the
 * UI surfaces *exactly* the citations the validator enforced — never
 * more.
 *
 * Pure function. No I/O. Unit-tested at
 * `apps/app/app/(authenticated)/today/components/__tests__/citation-parser.test.ts`.
 */

export type CitationKind = "snapshot" | "anomaly" | "flag" | "memory";

export interface TextSegment {
  kind: "text";
  text: string;
}

export interface CitationSegment {
  citationKind: CitationKind;
  id: string;
  kind: "citation";
  /** The full raw token, e.g. `[snapshot:abc-123]` — useful for keys. */
  raw: string;
}

export type Segment = TextSegment | CitationSegment;

/**
 * Pinned to the validator regex so the UI never out-renders the
 * trust boundary. If the validator ever recognises a new citation
 * kind, update both regexes in lock-step.
 */
const CITATION_MARKER_RE =
  /\[(?<kind>snapshot|anomaly|flag|memory):(?<id>[A-Za-z0-9_:.-]+)\]/g;

export const parseCitations = (md: string): Segment[] => {
  if (md.length === 0) {
    return [];
  }
  const segments: Segment[] = [];
  let cursor = 0;
  // Reset the regex's lastIndex by allocating a fresh one each call —
  // CITATION_MARKER_RE is global so reusing across calls would mutate.
  const re = new RegExp(CITATION_MARKER_RE.source, "g");
  let m: RegExpExecArray | null = re.exec(md);
  while (m !== null) {
    if (m.index > cursor) {
      segments.push({ kind: "text", text: md.slice(cursor, m.index) });
    }
    const groups = m.groups ?? {};
    segments.push({
      kind: "citation",
      citationKind: groups.kind as CitationKind,
      id: groups.id ?? "",
      raw: m[0],
    });
    cursor = m.index + m[0].length;
    m = re.exec(md);
  }
  if (cursor < md.length) {
    segments.push({ kind: "text", text: md.slice(cursor) });
  }
  return segments;
};

/**
 * Harvest the distinct set of cited ids per kind from a markdown blob.
 * Used by the server component to batch the lookup query.
 */
export const harvestCitedIds = (md: string): Record<CitationKind, string[]> => {
  const buckets: Record<CitationKind, Set<string>> = {
    snapshot: new Set(),
    anomaly: new Set(),
    flag: new Set(),
    memory: new Set(),
  };
  for (const seg of parseCitations(md)) {
    if (seg.kind === "citation") {
      buckets[seg.citationKind].add(seg.id);
    }
  }
  return {
    snapshot: [...buckets.snapshot],
    anomaly: [...buckets.anomaly],
    flag: [...buckets.flag],
    memory: [...buckets.memory],
  };
};
