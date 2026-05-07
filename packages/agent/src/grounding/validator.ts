/**
 * Day-3 grounding validator. Iron rule #6: every monetary or percentage token
 * in the prose fields of a DailyReport MUST carry an inline citation marker
 * `[snapshot:<id>]` | `[anomaly:<id>]` | `[flag:<id>]` AND every cited id MUST
 * have appeared in a tool result during the agent run (i.e., be present in
 * `traceData`). Reports that fail this gate are rejected at the renderer
 * boundary — they never ship.
 *
 * Pure function. No I/O.
 */

import type { DailyReport } from "../contracts/daily-report";

export interface AgentTrace {
  anomaly_ids: ReadonlySet<string>;
  flag_ids: ReadonlySet<string>;
  /** Set of snapshot_ids returned by tool calls during the run. */
  snapshot_ids: ReadonlySet<string>;
}

export type GroundingError =
  | { kind: "missing_inline_citation"; field: string; token: string }
  | {
      kind: "citation_not_in_trace";
      field: string;
      citationKind: "snapshot" | "anomaly" | "flag";
      id: string;
    }
  | {
      kind: "structural_citation_missing";
      field: string;
      reason: string;
    };

export type GroundingResult =
  | { ok: true }
  | { ok: false; errors: GroundingError[] };

/**
 * Match anything that looks like a number-of-interest in agent prose:
 *   $42  $1,234.56  -$10.00  3.5%  -12%  42.0  ($999)
 * We deliberately match aggressively; the citation regex below pairs each
 * token to its inline marker (or fails grounding).
 */
const NUMERIC_TOKEN_RE = /-?\$?\(?\d[\d,]*(\.\d+)?\)?%?/g;

/**
 * An inline citation marker the agent emits immediately after the token, e.g.
 *   "Revenue was $42,000 [snapshot:abc-123] yesterday."
 *   "ROAS climbed to 3.5x [snapshot:def-456]."
 *   "23 flagged orders [flag:ghi-789] reconciled."
 *
 * The marker is required to appear within `MAX_CITATION_DISTANCE` characters
 * after the token.
 */
const CITATION_MARKER_RE =
  /\[(?<kind>snapshot|anomaly|flag):(?<id>[A-Za-z0-9_:.-]+)\]/g;

const MAX_CITATION_DISTANCE = 80;

/** Strip a numeric token of formatting so it doesn't confuse downstream eyes. */
const stripFormatting = (s: string): string => s.replace(/[$,()%\s]/g, "");

interface ProseField {
  /** Path used in error reports (e.g. `top_movers[0].narrative`). */
  field: string;
  text: string;
}

const collectProseFields = (report: DailyReport): ProseField[] => {
  const fields: ProseField[] = [];
  fields.push({ field: "summary", text: report.summary });
  fields.push({
    field: "headline.value",
    text: report.headline.value,
  });
  report.top_movers.forEach((tm, i) => {
    fields.push({ field: `top_movers[${i}].narrative`, text: tm.narrative });
  });
  report.flags.forEach((f, i) => {
    fields.push({ field: `flags[${i}].narrative`, text: f.narrative });
  });
  report.actions.forEach((a, i) => {
    fields.push({ field: `actions[${i}].reasoning`, text: a.reasoning });
  });
  return fields;
};

/**
 * For a given prose blob, walk every numeric token and verify that within
 * MAX_CITATION_DISTANCE characters AFTER the token there's at least one
 * citation marker. Returns the per-field errors AND the set of marker ids
 * that appeared (for the trace-membership pass).
 */
interface FieldScanResult {
  citedIds: Array<{ kind: "snapshot" | "anomaly" | "flag"; id: string }>;
  errors: GroundingError[];
}

const scanField = (field: ProseField): FieldScanResult => {
  const errors: GroundingError[] = [];
  const citedIds: FieldScanResult["citedIds"] = [];

  // First pass: collect every citation marker with its index.
  const markers: Array<{
    start: number;
    end: number;
    kind: "snapshot" | "anomaly" | "flag";
    id: string;
  }> = [];
  for (const m of field.text.matchAll(CITATION_MARKER_RE)) {
    if (m.index === undefined || !m.groups) {
      continue;
    }
    const kind = m.groups.kind as "snapshot" | "anomaly" | "flag";
    const id = m.groups.id as string;
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      kind,
      id,
    });
    citedIds.push({ kind, id });
  }

  // Headline.value is itself a money string with no embedded prose; skip the
  // numeric-token check (it's covered by the structural citation below).
  if (field.field === "headline.value") {
    return { errors, citedIds };
  }

  // Second pass: numeric tokens. Skip any token whose match range falls
  // inside a citation marker — markers themselves can contain digits
  // (e.g. `[snapshot:snap-2026-05-07]`).
  const isInsideMarker = (start: number, end: number): boolean =>
    markers.some((mk) => start >= mk.start && end <= mk.end);

  for (const m of field.text.matchAll(NUMERIC_TOKEN_RE)) {
    if (m.index === undefined) {
      continue;
    }
    const tokenStart = m.index;
    const tokenEnd = tokenStart + m[0].length;
    if (isInsideMarker(tokenStart, tokenEnd)) {
      continue;
    }
    const hasNearbyCitation = markers.some(
      (mk) =>
        mk.start >= tokenEnd && mk.start - tokenEnd <= MAX_CITATION_DISTANCE
    );
    if (!hasNearbyCitation) {
      errors.push({
        kind: "missing_inline_citation",
        field: field.field,
        token: m[0],
      });
    }
  }

  return { errors, citedIds };
};

/**
 * Ensure every cited id was actually produced by a tool call during this run
 * (i.e., is in the trace's snapshot_ids/anomaly_ids/flag_ids set).
 */
const validateAgainstTrace = (
  fields: ProseField[],
  trace: AgentTrace
): GroundingError[] => {
  const errors: GroundingError[] = [];
  for (const field of fields) {
    const result = scanField(field);
    errors.push(...result.errors);
    for (const c of result.citedIds) {
      const set = traceSetFor(c.kind, trace);
      if (!set.has(c.id)) {
        errors.push({
          kind: "citation_not_in_trace",
          field: field.field,
          citationKind: c.kind,
          id: c.id,
        });
      }
    }
  }
  return errors;
};

const traceSetFor = (
  kind: "snapshot" | "anomaly" | "flag",
  trace: AgentTrace
): ReadonlySet<string> => {
  if (kind === "snapshot") {
    return trace.snapshot_ids;
  }
  if (kind === "anomaly") {
    return trace.anomaly_ids;
  }
  return trace.flag_ids;
};

const idFromCitation = (
  c:
    | { kind: "snapshot"; snapshot_id: string }
    | { kind: "anomaly"; anomaly_id: string }
    | { kind: "flag"; flag_id: string }
): string => {
  if (c.kind === "snapshot") {
    return c.snapshot_id;
  }
  if (c.kind === "anomaly") {
    return c.anomaly_id;
  }
  return c.flag_id;
};

/** Validate top-level structural citations match the trace. */
const validateStructuralCitations = (
  report: DailyReport,
  trace: AgentTrace
): GroundingError[] => {
  const errors: GroundingError[] = [];
  if (!trace.snapshot_ids.has(report.headline.citation.snapshot_id)) {
    errors.push({
      kind: "citation_not_in_trace",
      field: "headline.citation",
      citationKind: "snapshot",
      id: report.headline.citation.snapshot_id,
    });
  }
  report.top_movers.forEach((tm, i) => {
    tm.citations.forEach((c, j) => {
      const id = idFromCitation(c);
      const set = traceSetFor(c.kind, trace);
      if (!set.has(id)) {
        errors.push({
          kind: "citation_not_in_trace",
          field: `top_movers[${i}].citations[${j}]`,
          citationKind: c.kind,
          id,
        });
      }
    });
  });
  report.flags.forEach((f, i) => {
    if (!trace.flag_ids.has(f.citation.flag_id)) {
      errors.push({
        kind: "citation_not_in_trace",
        field: `flags[${i}].citation`,
        citationKind: "flag",
        id: f.citation.flag_id,
      });
    }
  });
  report.actions.forEach((a, i) => {
    a.citations.forEach((c, j) => {
      const id = idFromCitation(c);
      const set = traceSetFor(c.kind, trace);
      if (!set.has(id)) {
        errors.push({
          kind: "citation_not_in_trace",
          field: `actions[${i}].citations[${j}]`,
          citationKind: c.kind,
          id,
        });
      }
    });
  });
  return errors;
};

export const validateGrounding = (
  report: DailyReport,
  trace: AgentTrace
): GroundingResult => {
  const fields = collectProseFields(report);
  const proseErrors = validateAgainstTrace(fields, trace);
  const structuralErrors = validateStructuralCitations(report, trace);
  const errors = [...proseErrors, ...structuralErrors];
  if (errors.length === 0) {
    return { ok: true };
  }
  return { ok: false, errors };
};

/** Strip-formatting helper exported for renderer-side display (e.g.,
 *  rendering `$42` from the cited token in a sparkline tooltip). */
export { stripFormatting };

export class GroundingValidationError extends Error {
  readonly errors: GroundingError[];
  constructor(errors: GroundingError[]) {
    super(
      `grounding failed (${errors.length} error${errors.length === 1 ? "" : "s"})`
    );
    this.name = "GroundingValidationError";
    this.errors = errors;
  }
}
