import { describe, expect, it } from "vitest";
import { parseArgs } from "../parse-args";

const SLUG_REQUIRED_RE = /--slug=<orgSlug> is required/;
const POSITIVE_INTEGER_RE = /--limit-days must be a positive integer/;

describe("parseArgs", () => {
  it("defaults limitDays=90 and all booleans false", () => {
    expect(parseArgs(["--slug=foo"])).toEqual({
      slug: "foo",
      reset: false,
      limitDays: 90,
      withAgentRuns: false,
      dryRun: false,
    });
  });

  it("requires --slug", () => {
    expect(() => parseArgs([])).toThrow(SLUG_REQUIRED_RE);
  });

  it("parses --reset --dry-run --with-agent-runs", () => {
    const r = parseArgs([
      "--slug=demo",
      "--reset",
      "--dry-run",
      "--with-agent-runs",
    ]);
    expect(r.reset).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.withAgentRuns).toBe(true);
  });

  it("parses --limit-days=N (positive integer)", () => {
    expect(parseArgs(["--slug=x", "--limit-days=7"]).limitDays).toBe(7);
    expect(parseArgs(["--slug=x", "--limit-days=1"]).limitDays).toBe(1);
  });

  it("rejects non-positive --limit-days", () => {
    expect(() => parseArgs(["--slug=x", "--limit-days=0"])).toThrow(
      POSITIVE_INTEGER_RE
    );
    expect(() => parseArgs(["--slug=x", "--limit-days=-3"])).toThrow(
      POSITIVE_INTEGER_RE
    );
    expect(() => parseArgs(["--slug=x", "--limit-days=abc"])).toThrow(
      POSITIVE_INTEGER_RE
    );
  });

  it("ignores unknown flags rather than throwing", () => {
    // Forward-compat: future flags shouldn't break legacy invocations.
    const r = parseArgs(["--slug=x", "--unknown-flag", "--mystery=42"]);
    expect(r.slug).toBe("x");
  });

  it("accepts slugs with hyphens and digits", () => {
    expect(parseArgs(["--slug=demo-shopify-brand-2026"]).slug).toBe(
      "demo-shopify-brand-2026"
    );
  });
});
