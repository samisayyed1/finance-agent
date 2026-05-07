/**
 * Per-run trace buffer. Collected by PreToolUse + PostToolUse hooks during
 * agent.run, then flushed as a single agent_traces row at the end.
 */

export interface ToolInvocation {
  input: unknown;
  input_tokens?: number;
  latency_ms: number;
  output: unknown;
  output_tokens?: number;
  tool: string;
}

export class TraceBuffer {
  readonly traceId: string;
  readonly snapshot_ids = new Set<string>();
  readonly anomaly_ids = new Set<string>();
  readonly flag_ids = new Set<string>();
  readonly invocations: ToolInvocation[] = [];

  constructor(traceId: string) {
    this.traceId = traceId;
  }

  recordInvocation(invocation: ToolInvocation): void {
    this.invocations.push(invocation);
    this.harvestIds(invocation.output);
  }

  /**
   * Walk an arbitrary object and collect any `snapshot_id`, `anomaly_id`, or
   * `flag_id` string fields. Tools return well-known shapes; harvest is
   * tolerant of extra fields.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deep recursive walker — flattening would lose readability
  private harvestIds(value: unknown): void {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === "string" || typeof value === "number") {
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        this.harvestIds(v);
      }
      return;
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      for (const [key, v] of Object.entries(obj)) {
        if (key === "snapshot_id" && typeof v === "string") {
          this.snapshot_ids.add(v);
        } else if (key === "anomaly_id" && typeof v === "string") {
          this.anomaly_ids.add(v);
        } else if (key === "flag_id" && typeof v === "string") {
          this.flag_ids.add(v);
        } else {
          this.harvestIds(v);
        }
      }
    }
  }
}
