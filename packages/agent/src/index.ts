export { Citation, DailyReport, validateGrounding } from "./grounding";

export interface CreateAgentOptions {
  brandContext?: string;
  connectedSources: ReadonlyArray<
    | "shopify"
    | "stripe"
    | "meta"
    | "google"
    | "quickbooks"
    | "xero"
    | "netsuite"
    | "plaid"
  >;
  model: string;
  orgId: string;
  orgName: string;
  promptVersion: string;
}

/**
 * Build a per-org Claude Agent SDK instance with:
 *  - System prompt skeleton (org name + brand context + connected sources +
 *    today's snapshot placeholder + retrieved memories).
 *  - MCP client pointing at apps/mcp.
 *  - Grounding validator at the output boundary.
 *  - Skills loaded from `.claude/skills/`.
 *  - PostToolUse hook → writes every tool call to `agent_traces`.
 *
 * Day-0: returns a typed stub that throws on `run()`. Real wiring lands in
 * Phase 5+ once memory/feedback/learning land.
 */
export const createAgent = (_opts: CreateAgentOptions) => ({
  run: (_input: {
    question: string;
    today: Date;
  }): Promise<import("./grounding").DailyReport> => {
    throw new Error("@ai-cfo/agent: run() not implemented (Day-0)");
  },
});
