/**
 * CLI argv parser for scripts/demo-preflight.ts. Lives in its own module so
 * tests can exercise it without dragging in @ai-cfo/database at module load
 * (which would crash without DATABASE_URL — same pattern as parse-args.ts).
 */

export interface PreflightArgs {
  llmPing: boolean;
  slug: string;
}

export const parsePreflightArgs = (argv: readonly string[]): PreflightArgs => {
  let slug: string | null = null;
  let llmPing = true;
  for (const a of argv) {
    if (a.startsWith("--slug=")) {
      slug = a.slice("--slug=".length);
    } else if (a === "--no-llm-ping") {
      llmPing = false;
    }
  }
  if (!slug) {
    throw new Error("demo-preflight: --slug=<orgSlug> is required");
  }
  return { slug, llmPing };
};
