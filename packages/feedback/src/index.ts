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

const notImplemented = (method: string): never => {
  throw new Error(`@ai-cfo/feedback: ${method} not implemented (Day-0)`);
};

export const recordFeedback = (_input: FeedbackInput): Promise<void> =>
  notImplemented("recordFeedback");

export const recordOutcome = (_input: OutcomeInput): Promise<void> =>
  notImplemented("recordOutcome");
