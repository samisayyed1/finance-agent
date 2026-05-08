/**
 * @ai-cfo/learning — closed-loop runner jobs (Trigger.dev v3) + the pure
 * distillation function they share.
 *
 * Day 4 ships:
 *   - writeMemoriesFromTracesJob — daily Haiku distillation
 *   - measureClosedLoopJob       — daily KPI snapshot
 *   - rebuildEvalSetJob          — weekly eval-set refresh from operator feedback
 *   - tuneThresholdsJob          — weekly per-org anomaly threshold auto-tune
 *   - optimizePromptJob          — schemaTask stub; DSPy+GEPA deferred per ADR 0013
 */

export {
  createAnthropicDistiller,
  type DistilledMemory,
  DistilledMemorySchema,
  type DistillerDeps,
  distillTracesIntoMemories,
} from "./distill";
export {
  measureClosedLoopForOrg,
  measureClosedLoopJob,
} from "./jobs/measure-closed-loop";
export { optimizePromptJob } from "./jobs/optimize-prompt";
export {
  rebuildEvalSetForOrg,
  rebuildEvalSetJob,
} from "./jobs/rebuild-eval-set";
export {
  tuneThresholdsForOrg,
  tuneThresholdsJob,
} from "./jobs/tune-thresholds";
export {
  writeMemoriesFromTracesForOrg,
  writeMemoriesFromTracesJob,
} from "./jobs/write-memories-from-traces";
