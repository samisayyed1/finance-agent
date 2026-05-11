/**
 * Pure parser test for scripts/demo-preflight.ts. The integration
 * surface (DB + MCP + Anthropic) is exercised live by running the
 * script; this file just verifies the argv parser since it's the only
 * piece of demo-preflight that doesn't depend on env or the network.
 */

import { describe, expect, it } from "vitest";
import { parsePreflightArgs } from "../preflight-args";

const SLUG_REQUIRED_RE = /--slug=<orgSlug> is required/;

describe("parsePreflightArgs", () => {
  it("requires --slug", () => {
    expect(() => parsePreflightArgs([])).toThrow(SLUG_REQUIRED_RE);
  });

  it("defaults llmPing=true", () => {
    expect(parsePreflightArgs(["--slug=demo"])).toEqual({
      slug: "demo",
      llmPing: true,
    });
  });

  it("disables LLM ping with --no-llm-ping", () => {
    expect(parsePreflightArgs(["--slug=demo", "--no-llm-ping"])).toEqual({
      slug: "demo",
      llmPing: false,
    });
  });

  it("ignores unknown flags forward-compatibly", () => {
    expect(parsePreflightArgs(["--slug=x", "--future-flag"])).toEqual({
      slug: "x",
      llmPing: true,
    });
  });
});
