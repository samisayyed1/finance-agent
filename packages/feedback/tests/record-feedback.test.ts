/**
 * Integration test for recordFeedback / recordOutcome.
 *
 * Gated on DATABASE_URL: the suite skips cleanly when the env var is
 * unset (e.g. CI without a Postgres pointer, or a laptop with a blank
 * .env.local). Importantly, the `@ai-cfo/database` and `../src/index`
 * modules are loaded *dynamically inside* `beforeAll` rather than at
 * the top of the file — those modules evaluate env (DATABASE_URL via
 * @t3-oss/env-core) at import time and would crash the entire test
 * file before `describe.skipIf` had a chance to short-circuit it.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SLUG = `test-feedback-${Date.now()}`;
const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("recordFeedback / recordOutcome", () => {
  let db: typeof import("@ai-cfo/database");
  let mod: typeof import("../src/index");
  let orgId: string;

  beforeAll(async () => {
    db = await import("@ai-cfo/database");
    mod = await import("../src/index");

    const inserted = await db.database
      .insert(db.organizations)
      .values({ name: "test-feedback", slug: SLUG })
      .returning({ id: db.organizations.id });
    const row = inserted[0];
    if (!row) {
      throw new Error("failed to create test org");
    }
    orgId = row.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.database
        .delete(db.organizations)
        .where(db.eq(db.organizations.id, orgId));
    }
  });

  it("recordFeedback writes a row that round-trips", async () => {
    const traceId = `trace_test_${Date.now()}`;
    const result = await mod.recordFeedback({
      orgId,
      traceId,
      signal: "positive",
      message: "this was helpful",
      channel: "email",
      operatorUserId: "user_test",
    });
    expect(result.id).toBeDefined();

    const rows = await db.database
      .select()
      .from(db.agentFeedback)
      .where(db.eq(db.agentFeedback.id, result.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.signal).toBe("positive");
    expect(rows[0]?.message).toBe("this was helpful");
    expect(rows[0]?.channel).toBe("email");
  });

  it("recordOutcome writes a row with measured_impact_usd as numeric", async () => {
    const recommendationId = `rec_test_${Date.now()}`;
    const result = await mod.recordOutcome({
      orgId,
      recommendationId,
      wasTaken: true,
      measuredImpactUsd: 1234.56,
      notes: "raised refund threshold",
    });
    const rows = await db.database
      .select()
      .from(db.agentOutcomes)
      .where(db.eq(db.agentOutcomes.id, result.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wasTaken).toBe(true);
    expect(rows[0]?.measuredImpactUsd).toBe("1234.5600");
  });
});
