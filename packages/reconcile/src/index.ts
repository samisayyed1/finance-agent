export const FLAG_KINDS = [
  "ORDER_MISSING_PAYMENT",
  "PAYMENT_WITHOUT_ORDER",
  "REFUND_MISMATCH",
  "DUPLICATE_ORDER",
  "FEE_DRIFT",
  "PAYOUT_GAP",
  "PERIOD_GAP",
] as const;

export type FlagKind = (typeof FLAG_KINDS)[number];

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
