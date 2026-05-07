import { describe, expect, it } from "vitest";
import {
  measureClosedLoopJob,
  optimizePromptJob,
  rebuildEvalSetJob,
  tuneThresholdsJob,
  writeMemoriesFromTracesJob,
} from "..";

describe("@ai-cfo/learning", () => {
  it("declares all 5 closed-loop jobs", () => {
    expect(writeMemoriesFromTracesJob.id).toBe(
      "ai-cfo.write-memories-from-traces"
    );
    expect(rebuildEvalSetJob.id).toBe("ai-cfo.rebuild-eval-set");
    expect(tuneThresholdsJob.id).toBe("ai-cfo.tune-thresholds");
    expect(optimizePromptJob.id).toBe("ai-cfo.optimize-prompt");
    expect(measureClosedLoopJob.id).toBe("ai-cfo.measure-closed-loop");
  });
  it("Day-0: real per-org learning loop not yet implemented", () => {
    expect.fail("not implemented");
  });
});
