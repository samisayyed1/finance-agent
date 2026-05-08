/**
 * Formatting helpers for the operator dashboard.
 *
 * Iron rule echo: the AI never computes numbers, but the dashboard does
 * format numbers that came FROM the database (cent-exact strings from
 * `numeric` columns). All money strings go through `Intl.NumberFormat`
 * — never raw arithmetic on number-typed money.
 */

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const COMPACT_NUMBER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const PCT_DIGITS = 2;
const RATIO_DIGITS = 2;

export const formatMoney = (
  raw: string | number | null | undefined
): string => {
  if (raw === null || raw === undefined) {
    return "—";
  }
  const num = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  if (!Number.isFinite(num)) {
    return "—";
  }
  return MONEY_FORMATTER.format(num);
};

export const formatPctFromRatio = (
  raw: string | number | null | undefined
): string => {
  if (raw === null || raw === undefined) {
    return "—";
  }
  const num = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  if (!Number.isFinite(num)) {
    return "—";
  }
  return `${(num * 100).toFixed(PCT_DIGITS)}%`;
};

export const formatPctSigned = (raw: number | null | undefined): string => {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) {
    return "—";
  }
  const sign = raw > 0 ? "+" : "";
  return `${sign}${raw.toFixed(PCT_DIGITS)}%`;
};

export const formatRatio = (
  raw: string | number | null | undefined
): string => {
  if (raw === null || raw === undefined) {
    return "—";
  }
  const num = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  if (!Number.isFinite(num)) {
    return "—";
  }
  return num.toFixed(RATIO_DIGITS);
};

export const formatInt = (raw: number | null | undefined): string => {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) {
    return "—";
  }
  return COMPACT_NUMBER.format(raw);
};

/**
 * Compute signed-percent delta from two numeric strings (or numbers).
 * Returns null on missing data or zero baseline. This is allowed under
 * iron rule #1 because the inputs come from the DB, not the agent.
 */
export const computePctDelta = (
  current: string | number | null | undefined,
  baseline: string | number | null | undefined
): number | null => {
  if (
    current === null ||
    current === undefined ||
    baseline === null ||
    baseline === undefined
  ) {
    return null;
  }
  const c = typeof current === "string" ? Number.parseFloat(current) : current;
  const b =
    typeof baseline === "string" ? Number.parseFloat(baseline) : baseline;
  if (!(Number.isFinite(c) && Number.isFinite(b)) || b === 0) {
    return null;
  }
  return ((c - b) / b) * 100;
};
