export { featureRecall, groundingRate, hasCitations } from "./assertions";

/**
 * Per-org eval runner stub. Reads from `org_eval_set` and runs Promptfoo's
 * programmatic API across the org's labeled fixtures, logging per-org
 * grounding rate to `agent_traces`. Phase 5+ implementation.
 */
export const runPerOrgEval = (_orgId: string): Promise<void> => {
  throw new Error("@ai-cfo/evals: runPerOrgEval not implemented (Day-0)");
};
