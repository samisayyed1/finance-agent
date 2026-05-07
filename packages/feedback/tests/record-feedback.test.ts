import {
  agentFeedback,
  agentOutcomes,
  database,
  eq,
  organizations,
} from "@ai-cfo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordFeedback, recordOutcome } from "../src/index";

const SLUG = `test-feedback-${Date.now()}`;
let orgId: string;

const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("recordFeedback / recordOutcome", () => {
  beforeAll(async () => {
    const inserted = await database
      .insert(organizations)
      .values({ name: "test-feedback", slug: SLUG })
      .returning({ id: organizations.id });
    const row = inserted[0];
    if (!row) {
      throw new Error("failed to create test org");
    }
    orgId = row.id;
  });

  afterAll(async () => {
    if (orgId) {
      await database.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it("recordFeedback writes a row that round-trips", async () => {
    const traceId = `trace_test_${Date.now()}`;
    const result = await recordFeedback({
      orgId,
      traceId,
      signal: "positive",
      message: "this was helpful",
      channel: "email",
      operatorUserId: "user_test",
    });
    expect(result.id).toBeDefined();

    const rows = await database
      .select()
      .from(agentFeedback)
      .where(eq(agentFeedback.id, result.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.signal).toBe("positive");
    expect(rows[0]?.message).toBe("this was helpful");
    expect(rows[0]?.channel).toBe("email");
  });

  it("recordOutcome writes a row with measured_impact_usd as numeric", async () => {
    const recommendationId = `rec_test_${Date.now()}`;
    const result = await recordOutcome({
      orgId,
      recommendationId,
      wasTaken: true,
      measuredImpactUsd: 1234.56,
      notes: "raised refund threshold",
    });
    const rows = await database
      .select()
      .from(agentOutcomes)
      .where(eq(agentOutcomes.id, result.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wasTaken).toBe(true);
    expect(rows[0]?.measuredImpactUsd).toBe("1234.5600");
  });
});
