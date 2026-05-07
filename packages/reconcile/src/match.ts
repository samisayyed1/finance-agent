/**
 * Source-agnostic Order ↔ Payment matcher.
 *
 * Iron Rule #10: NO Shopify- or Stripe-specific assumptions here. The matcher
 * operates on canonical Order and Payment shapes — adding QuickBooks invoices
 * + Plaid bank-deposit reconciliation later requires zero changes here.
 *
 * Strategy:
 *   - For each unmatched paid order, find an unmatched payment whose
 *     |Δ amount| ≤ amountToleranceMinor (default 1¢) AND whose
 *     |Δ time|   ≤ timeToleranceMs    (default 30 minutes).
 *   - Greedy: among candidates, choose the smallest |Δamount|, breaking ties
 *     by smallest |Δtime|, breaking remaining ties by earliest payment.
 *   - Each payment matches at most one order; mark used.
 *
 * Returns: { matched, orphanedOrders, orphanedPayments }.
 */

export interface MatchOrder {
  /** Cent-exact integer minor units. */
  amountMinor: number;
  currency: string;
  id: string;
  occurredAt: Date;
}

export interface MatchPayment {
  amountMinor: number;
  currency: string;
  feeMinor: number;
  id: string;
  occurredAt: Date;
}

export interface Match {
  deltaAmountMinor: number;
  deltaTimeMs: number;
  orderId: string;
  paymentId: string;
}

export interface MatchResult {
  matched: Match[];
  orphanedOrders: string[];
  orphanedPayments: string[];
}

export interface MatchOptions {
  amountToleranceMinor?: number;
  timeToleranceMs?: number;
}

const DEFAULTS: Required<MatchOptions> = {
  amountToleranceMinor: 1,
  timeToleranceMs: 30 * 60 * 1000,
};

export const matchOrdersToPayments = (
  orders: MatchOrder[],
  payments: MatchPayment[],
  options: MatchOptions = {}
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: greedy match has 4 tie-breaking criteria + per-order/per-payment loops; splitting further obscures the algorithm
): MatchResult => {
  const cfg = { ...DEFAULTS, ...options };

  const usedPayment = new Set<string>();
  const matched: Match[] = [];
  const orphanedOrderIds: string[] = [];

  // Sort orders by occurrence time so greedy matching is stable.
  const sortedOrders = [...orders].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );

  for (const order of sortedOrders) {
    let best: {
      payment: MatchPayment;
      deltaAmount: number;
      deltaTime: number;
    } | null = null;

    for (const payment of payments) {
      if (usedPayment.has(payment.id)) {
        continue;
      }
      if (payment.currency !== order.currency) {
        continue;
      }
      const deltaAmount = Math.abs(order.amountMinor - payment.amountMinor);
      if (deltaAmount > cfg.amountToleranceMinor) {
        continue;
      }
      const deltaTime = Math.abs(
        order.occurredAt.getTime() - payment.occurredAt.getTime()
      );
      if (deltaTime > cfg.timeToleranceMs) {
        continue;
      }
      if (
        best === null ||
        deltaAmount < best.deltaAmount ||
        (deltaAmount === best.deltaAmount && deltaTime < best.deltaTime) ||
        (deltaAmount === best.deltaAmount &&
          deltaTime === best.deltaTime &&
          payment.occurredAt < best.payment.occurredAt)
      ) {
        best = { payment, deltaAmount, deltaTime };
      }
    }

    if (best) {
      usedPayment.add(best.payment.id);
      matched.push({
        orderId: order.id,
        paymentId: best.payment.id,
        deltaAmountMinor: best.deltaAmount,
        deltaTimeMs: best.deltaTime,
      });
    } else {
      orphanedOrderIds.push(order.id);
    }
  }

  const orphanedPaymentIds = payments
    .filter((p) => !usedPayment.has(p.id))
    .map((p) => p.id);

  return {
    matched,
    orphanedOrders: orphanedOrderIds,
    orphanedPayments: orphanedPaymentIds,
  };
};
