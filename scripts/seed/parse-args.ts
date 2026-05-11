/**
 * CLI argv parser for scripts/seed-demo-org.ts. Lives in its own module so
 * tests can import + exercise it without dragging in the side-effecting
 * orchestrator (which calls `main()` at top level and would attempt a DB
 * connection on import).
 */

export interface CliArgs {
  dryRun: boolean;
  limitDays: number;
  reset: boolean;
  slug: string;
  withAgentRuns: boolean;
}

export const parseArgs = (argv: readonly string[]): CliArgs => {
  let slug: string | null = null;
  let reset = false;
  let limitDays = 90;
  let withAgentRuns = false;
  let dryRun = false;
  for (const a of argv) {
    if (a.startsWith("--slug=")) {
      slug = a.slice("--slug=".length);
    } else if (a === "--reset") {
      reset = true;
    } else if (a.startsWith("--limit-days=")) {
      const n = Number.parseInt(a.slice("--limit-days=".length), 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--limit-days must be a positive integer; got '${a}'`);
      }
      limitDays = n;
    } else if (a === "--with-agent-runs") {
      withAgentRuns = true;
    } else if (a === "--dry-run") {
      dryRun = true;
    }
  }
  if (!slug) {
    throw new Error("seed-demo-org: --slug=<orgSlug> is required");
  }
  return { slug, reset, limitDays, withAgentRuns, dryRun };
};
