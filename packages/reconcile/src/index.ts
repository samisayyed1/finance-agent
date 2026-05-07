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

export interface ReconciliationFlag {
  actual: number;
  delta: number;
  expected: number;
  flag_id: string;
  kind: FlagKind;
  order_id?: string;
  org_id: string;
  payment_id?: string;
  status: "open" | "resolved" | "dismissed";
}

export interface ReconciliationWindow {
  from: Date;
  to: Date;
}

export const runReconciliation = (
  _orgId: string,
  _window: ReconciliationWindow
): Promise<ReconciliationFlag[]> => {
  throw new Error(
    "@ai-cfo/reconcile: runReconciliation not implemented (Day-0)"
  );
};
