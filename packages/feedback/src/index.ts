import { agentFeedback, agentOutcomes, database } from "@ai-cfo/database";

export type FeedbackChannel = "slack" | "email" | "dashboard" | "whatsapp";
export type FeedbackSignal = "positive" | "negative" | "correction";

export interface FeedbackInput {
  channel: FeedbackChannel;
  message?: string;
  operatorUserId?: string;
  orgId: string;
  signal: FeedbackSignal;
  traceId: string;
}

export interface OutcomeInput {
  measuredImpactUsd?: number;
  notes?: string;
  orgId: string;
  recommendationId: string;
  wasTaken: boolean;
}

export interface RecordFeedbackResult {
  id: string;
  recordedAt: Date;
}

export const recordFeedback = async (
  input: FeedbackInput
): Promise<RecordFeedbackResult> => {
  const inserted = await database
    .insert(agentFeedback)
    .values({
      orgId: input.orgId,
      traceId: input.traceId,
      signal: input.signal,
      message: input.message ?? null,
      channel: input.channel,
      operatorUserId: input.operatorUserId ?? null,
    })
    .returning({ id: agentFeedback.id, createdAt: agentFeedback.createdAt });
  const row = inserted[0];
  if (!row) {
    throw new Error("recordFeedback: insert returned no row");
  }
  return { id: row.id, recordedAt: row.createdAt };
};

export interface RecordOutcomeResult {
  id: string;
  recordedAt: Date;
}

export const recordOutcome = async (
  input: OutcomeInput
): Promise<RecordOutcomeResult> => {
  const inserted = await database
    .insert(agentOutcomes)
    .values({
      orgId: input.orgId,
      recommendationId: input.recommendationId,
      wasTaken: input.wasTaken,
      measuredImpactUsd:
        input.measuredImpactUsd != null
          ? input.measuredImpactUsd.toString()
          : null,
      measuredAt: input.measuredImpactUsd != null ? new Date() : null,
      notes: input.notes ?? null,
    })
    .returning({ id: agentOutcomes.id, createdAt: agentOutcomes.createdAt });
  const row = inserted[0];
  if (!row) {
    throw new Error("recordOutcome: insert returned no row");
  }
  return { id: row.id, recordedAt: row.createdAt };
};
