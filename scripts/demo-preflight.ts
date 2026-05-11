#!/usr/bin/env bun
/**
 * Day-9 demo pre-flight checker.
 *
 * One command — `bun run scripts/demo-preflight.ts --slug=demo-shopify-brand`
 * — walks every prerequisite from `docs/runbooks/DEMO_VIDEO_SCRIPT.md` and
 * prints a green/red checklist. Exits 0 only if everything passes.
 *
 * Read-only. Never writes to the DB. Never invokes the real agent. The
 * optional Anthropic ping is opt-out via `--no-llm-ping` (default ON; if
 * ANTHROPIC_API_KEY is set we burn ~5 tokens to verify the key works).
 *
 * Usage:
 *   bun run scripts/demo-preflight.ts --slug=demo-shopify-brand
 *   bun run scripts/demo-preflight.ts --slug=demo-shopify-brand --no-llm-ping
 */

import { database, eq, organizations, sql } from "@ai-cfo/database";
import { type PreflightArgs, parsePreflightArgs } from "./seed/preflight-args";

type CheckStatus = "pass" | "warn" | "fail";

interface CheckResult {
  detail: string;
  name: string;
  status: CheckStatus;
}

const REQUIRED_ENV = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "MCP_SERVER_URL",
  "MCP_BEARER",
] as const;

const OPTIONAL_ENV = ["OPENAI_API_KEY"] as const;

const checkEnv = (): CheckResult[] => {
  const results: CheckResult[] = [];
  const missing: string[] = [];
  for (const k of REQUIRED_ENV) {
    if (!process.env[k]) {
      missing.push(k);
    }
  }
  if (missing.length === 0) {
    results.push({
      name: "env: required vars",
      status: "pass",
      detail: REQUIRED_ENV.join(", "),
    });
  } else {
    results.push({
      name: "env: required vars",
      status: "fail",
      detail: `missing: ${missing.join(", ")}`,
    });
  }
  const optMissing = OPTIONAL_ENV.filter((k) => !process.env[k]);
  if (optMissing.length === 0) {
    results.push({
      name: "env: optional vars",
      status: "pass",
      detail: OPTIONAL_ENV.join(", "),
    });
  } else {
    results.push({
      name: "env: optional vars",
      status: "warn",
      detail: `missing: ${optMissing.join(", ")} (degrades /analyst chat retrieval)`,
    });
  }
  return results;
};

interface DbContext {
  orgId: string;
  orgName: string;
}

const checkDbAndResolveOrg = async (
  slug: string
): Promise<{ result: CheckResult; ctx: DbContext | null }> => {
  try {
    await database.execute(sql`SELECT 1`);
  } catch (err) {
    return {
      result: {
        name: "db: connection",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      },
      ctx: null,
    };
  }
  const rows = await database
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return {
      result: {
        name: "db: demo org row",
        status: "fail",
        detail: `no organizations row with slug=${slug} — run scripts/seed-demo-org.ts first`,
      },
      ctx: null,
    };
  }
  return {
    result: {
      name: "db: demo org row",
      status: "pass",
      detail: `${row.name} (${row.id})`,
    },
    ctx: { orgId: row.id, orgName: row.name },
  };
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface SeedCheck {
  min: number;
  name: string;
  note: string;
  query: ReturnType<typeof sql>;
}

const buildSeedChecks = (orgId: string): SeedCheck[] => {
  const sevenDaysAgo = new Date(Date.now() - 7 * ONE_DAY_MS)
    .toISOString()
    .slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * ONE_DAY_MS)
    .toISOString()
    .slice(0, 10);
  return [
    {
      name: "data: daily_metrics rows",
      query: sql`SELECT count(*)::int as c FROM daily_metrics WHERE org_id = ${orgId}`,
      min: 1,
      note: "compute_daily_metrics output for /today + /metrics",
    },
    {
      name: "data: recent reports (last 7d)",
      query: sql`SELECT count(*)::int as c FROM reports WHERE org_id = ${orgId} AND date >= ${sevenDaysAgo}`,
      min: 1,
      note: "AI summary card on /today",
    },
    {
      name: "data: open reconciliation flags",
      query: sql`SELECT count(*)::int as c FROM reconciliation_flags WHERE org_id = ${orgId}`,
      min: 1,
      note: "/settings/reconciliation bulk-resolve UI",
    },
    {
      name: "data: anomalies (last 30d)",
      query: sql`SELECT count(*)::int as c FROM anomalies WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo}`,
      min: 1,
      note: "What needs attention card on /today",
    },
    {
      name: "data: agent_traces rows",
      query: sql`SELECT count(*)::int as c FROM agent_traces WHERE org_id = ${orgId}`,
      min: 1,
      note: "/analyst memory retrieval substrate",
    },
    {
      name: "data: agent_memories rows",
      query: sql`SELECT count(*)::int as c FROM agent_memories WHERE org_id = ${orgId}`,
      min: 1,
      note: "memory citation surface in /analyst",
    },
  ];
};

const checkSeedData = async (orgId: string): Promise<CheckResult[]> => {
  const checks = buildSeedChecks(orgId);
  const results: CheckResult[] = [];
  for (const c of checks) {
    const rows = (await database.execute(c.query)) as unknown as Array<{
      c: number;
    }>;
    const n = rows[0]?.c ?? 0;
    results.push({
      name: c.name,
      status: (n >= c.min ? "pass" : "fail") as CheckStatus,
      detail:
        n >= c.min
          ? `count=${n}`
          : `count=${n} (expected ≥ ${c.min}; ${c.note})`,
    });
  }
  return results;
};

const checkMcp = async (): Promise<CheckResult> => {
  const url = process.env.MCP_SERVER_URL;
  if (!url) {
    return {
      name: "mcp: server reachable",
      status: "fail",
      detail: "MCP_SERVER_URL unset",
    };
  }
  const bearer = process.env.MCP_BEARER;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status === 200 || res.status === 204) {
      return {
        name: "mcp: server reachable",
        status: "pass",
        detail: `${url} → ${res.status}`,
      };
    }
    if (res.status === 401) {
      return {
        name: "mcp: server reachable",
        status: "warn",
        detail: `${url} → 401 (server up; bearer rejected — check MCP_BEARER)`,
      };
    }
    if (res.status === 405 || res.status === 404 || res.status === 400) {
      // MCP servers commonly reject bare GET on the streamable HTTP transport
      // endpoint with 400/404/405. That still proves the server is up and
      // listening — the agent flow uses POST + JSON-RPC.
      return {
        name: "mcp: server reachable",
        status: "pass",
        detail: `${url} → ${res.status} (expected for non-POST; transport is alive)`,
      };
    }
    return {
      name: "mcp: server reachable",
      status: "warn",
      detail: `${url} → ${res.status} (unexpected status; check apps/mcp logs)`,
    };
  } catch (err) {
    return {
      name: "mcp: server reachable",
      status: "fail",
      detail: err instanceof Error ? `${url} → ${err.message}` : String(err),
    };
  }
};

const TRAILING_SLASH_RE = /\/$/;

const checkAnthropic = async (): Promise<CheckResult> => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      name: "llm: anthropic ping",
      status: "fail",
      detail: "ANTHROPIC_API_KEY unset",
    };
  }
  const baseUrl =
    process.env.ANTHROPIC_BASE_URL?.replace(TRAILING_SLASH_RE, "") ??
    "https://api.anthropic.com";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.ANTHROPIC_CLASSIFIER_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 4,
        messages: [{ role: "user", content: "pong" }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      return {
        name: "llm: anthropic ping",
        status: "pass",
        detail: `200 from ${baseUrl}/v1/messages (~5 tokens)`,
      };
    }
    const text = await res.text();
    return {
      name: "llm: anthropic ping",
      status: "fail",
      detail: `${res.status} ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      name: "llm: anthropic ping",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
};

const STATUS_GLYPH: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "•",
  fail: "✗",
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "[32m",
  warn: "[33m",
  fail: "[31m",
};
const COLOR_RESET = "[0m";

const formatCheck = (r: CheckResult): string => {
  const color = STATUS_COLOR[r.status];
  const glyph = STATUS_GLYPH[r.status];
  return `${color}${glyph}${COLOR_RESET} ${r.name.padEnd(38)} ${r.detail}`;
};

export const runPreflight = async (
  args: PreflightArgs
): Promise<{ results: CheckResult[]; ok: boolean }> => {
  const results: CheckResult[] = [];

  results.push(...checkEnv());

  const dbResolved = await checkDbAndResolveOrg(args.slug).catch(
    (err): { result: CheckResult; ctx: null } => ({
      result: {
        name: "db: connection",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      },
      ctx: null,
    })
  );
  results.push(dbResolved.result);

  if (dbResolved.ctx) {
    const seed = await checkSeedData(dbResolved.ctx.orgId);
    results.push(...seed);
  }

  const mcp = await checkMcp();
  results.push(mcp);

  if (args.llmPing) {
    results.push(await checkAnthropic());
  }

  const hasFail = results.some((r) => r.status === "fail");
  return { results, ok: !hasFail };
};

const main = async (): Promise<void> => {
  const args = parsePreflightArgs(process.argv.slice(2));
  process.stdout.write(`\nDemo pre-flight for --slug=${args.slug}\n\n`);

  const { results, ok } = await runPreflight(args);

  for (const r of results) {
    process.stdout.write(`${formatCheck(r)}\n`);
  }
  process.stdout.write("\n");
  const fails = results.filter((r) => r.status === "fail").length;
  const warns = results.filter((r) => r.status === "warn").length;
  if (ok) {
    process.stdout.write(
      `${STATUS_COLOR.pass}PASS${COLOR_RESET} — ready to record (${warns} warning${warns === 1 ? "" : "s"})\n`
    );
  } else {
    process.stdout.write(
      `${STATUS_COLOR.fail}NEEDS WORK${COLOR_RESET} — ${fails} blocker${fails === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}\n`
    );
  }
  process.exit(ok ? 0 : 1);
};

if (import.meta.main) {
  main().catch((err) => {
    process.stderr.write(
      `demo-preflight: FAILED ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  });
}

export type { CheckResult, CheckStatus };
export type { PreflightArgs } from "./seed/preflight-args";
export { parsePreflightArgs } from "./seed/preflight-args";
