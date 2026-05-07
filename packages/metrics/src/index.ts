/**
 * @ai-cfo/metrics — cent-exact daily metrics computation.
 *
 * Iron Rule #1: the LLM never computes a number. It calls
 * `compute_daily_metrics(orgId, date)` (here) via MCP. All monetary arithmetic
 * uses Dinero.js — never raw `number`.
 *
 * Day-0: function signature is real, body throws "not implemented".
 */

export interface DailyMetrics {
  ad_spend: number;
  aov: number;
  blended_mer: number;
  cac: number;
  computed_at: string; // ISO datetime
  contribution_profit: number;
  date: string; // ISO YYYY-MM-DD
  fees: number;
  gross_margin: number;
  new_customers: number;
  orders: number;
  org_id: string;
  refund_rate: number;
  refunds: number;
  revenue_gross: number;
  revenue_net: number;
  roas: number;
  snapshot_id: string;
}

export const compute_daily_metrics = (
  _orgId: string,
  _date: Date
): Promise<DailyMetrics> => {
  throw new Error(
    "@ai-cfo/metrics: compute_daily_metrics not implemented (Day-0)"
  );
};
