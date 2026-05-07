# AI Operating CFO — product playbook

The product playbook lives here. Sami will paste it after Day-0 ships. The principles in CLAUDE.md and AGENTS.md govern all work until then.

## DailyReport contract (locked Day-3)

The single typed surface shared by the agent (emit), grounding validator (gate), renderers (read), and delivery (transport). The canonical Zod schema lives in `packages/agent/src/contracts/daily-report.ts`. Below is the shape:

```ts
DailyReport = {
  org_id: UUID
  date: "YYYY-MM-DD"
  snapshot_id: string
  headline: {
    metric: string                       // e.g. "revenue_net"
    value: MoneyString                   // "$1,234.56"
    delta_pct: number
    trend: "up" | "down" | "flat"
    citation: { kind: "snapshot", snapshot_id: string }
  }
  summary: string                        // 2-3 sentences; every numeric token cited inline
  top_movers: Array<{
    metric, value: MoneyString, delta_abs: MoneyString, delta_pct,
    direction: "positive" | "negative",
    narrative: string,                   // 1-2 sentences w/ inline citations
    citations: Citation[]                // ≥ 1
  }>
  flags: Array<{
    flag_id: string,
    kind: ReconciliationFlagKind,        // ORDER_MISSING_PAYMENT | …
    severity: "low" | "medium" | "high",
    narrative: string,
    citation: { kind: "flag", flag_id: string }
  }>
  actions: Array<{                       // recommendations only — Iron Rule #8
    title: string,
    reasoning: string,                   // citations required
    irreversible: boolean,
    citations: Citation[]
  }>
  sync_health: Array<{
    source: ConnectorSource,
    status: "green" | "yellow" | "red",
    last_synced_at: ISO timestamp,
    last_error?: string | null
  }>
  metadata: {
    model: string,                       // e.g. "claude-opus-4-7"
    prompt_version: string,              // "daily-report-v1"
    generated_at: ISO timestamp,
    trace_id: string                     // matches agent_traces.trace_id
  }
}

Citation = 
  | { kind: "snapshot", snapshot_id: string }
  | { kind: "anomaly",  anomaly_id:  string }
  | { kind: "flag",     flag_id:     string }
```

### Inline citation grammar (in prose fields)

Every monetary or percentage token in `summary`, `top_movers[].narrative`, `flags[].narrative`, and `actions[].reasoning` MUST carry an inline citation marker within 80 characters AFTER the token:

```
"Revenue closed at $42,000.00 [snapshot:snap-2026-05-07]."
"Refund rate climbed to 8.7% [snapshot:snap-2026-05-07]."
"23 orders missed payment [flag:MISSING_PAY_abc]."
```

The grounding validator (`packages/agent/src/grounding/validator.ts`) rejects reports that violate this. Every cited id MUST also appear in the trace's `snapshot_ids`/`anomaly_ids`/`flag_ids` set — the agent can't fabricate ids.

### Example fixture

```json
{
  "org_id": "11111111-2222-4333-8444-555555555555",
  "date": "2026-05-07",
  "snapshot_id": "snap-2026-05-07",
  "headline": {
    "metric": "revenue_net",
    "value": "$42,000.00",
    "delta_pct": 12.5,
    "trend": "up",
    "citation": { "kind": "snapshot", "snapshot_id": "snap-2026-05-07" }
  },
  "summary": "Revenue closed at $42,000.00 [snapshot:snap-2026-05-07], up 12.5% [snapshot:snap-2026-05-07] vs last week's average.",
  "top_movers": [...],
  "flags": [...],
  "actions": [...],
  "sync_health": [...],
  "metadata": {
    "model": "claude-opus-4-7",
    "prompt_version": "daily-report-v1",
    "generated_at": "2026-05-08T07:00:00.000Z",
    "trace_id": "trace_2026-05-07_..."
  }
}
```

A complete fixture lives at `packages/reports/tests/fixture.ts` and drives the renderer test suite.
