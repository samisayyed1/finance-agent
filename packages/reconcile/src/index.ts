export const FLAG_KINDS = [
  "ORDER_MISSING_PAYMENT",
  "PAYMENT_WITHOUT_ORDER",
  "REFUND_MISMATCH",
  "DUPLICATE_ORDER",
  "FEE_DRIFT",
  "PAYOUT_GAP",
  "PERIOD_GAP",
  "ATTRIBUTION_MISMATCH",
] as const;

export type FlagKind = (typeof FLAG_KINDS)[number];

export {
  AD_SOURCES,
  type AdMetricDailySummary,
  type AdSource,
  type AttributionMismatchInput,
  type AttributionMismatchResult,
  detectAttributionMismatch,
  type OrderForAttribution,
} from "./attribution-match";
export {
  type Match,
  type MatchOptions,
  type MatchOrder,
  type MatchPayment,
  type MatchResult,
  matchOrdersToPayments,
} from "./match";
export {
  type ReconcileResult,
  type ReconcileWindow,
  runReconciliation,
} from "./run-reconciliation";
