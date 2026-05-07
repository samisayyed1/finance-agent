/**
 * Shopify money helpers.
 *
 * Shopify's REST API returns money as decimal strings (e.g. "199.95"). We
 * convert to integer minor units (cents) at the connector boundary so the
 * downstream truth layer (packages/metrics, Dinero.js) only ever handles
 * integer math. Precision: scale matches the currency's exponent (USD=2,
 * JPY=0, etc.). Day-1 we assume scale=2 — which is correct for every
 * Shopify-supported currency the wedge customer base uses (USD/EUR/GBP/AUD/
 * CAD/etc.). Currencies with non-2 scale (JPY, KRW) are tracked as a TODO
 * and will gain explicit currency-table lookup before we onboard a brand
 * selling in them.
 */

const TWO_DP_RE = /^-?\d+(\.\d{1,2})?$/;

export const decimalStringToMinor = (value: string | number): number => {
  const str = typeof value === "number" ? value.toString() : value;
  if (!TWO_DP_RE.test(str)) {
    throw new Error(
      `decimalStringToMinor: refusing to silently round '${str}' (>2dp). Day-1 supports only scale=2 currencies; add a currency table before onboarding non-2dp.`
    );
  }
  const negative = str.startsWith("-");
  const absStr = negative ? str.slice(1) : str;
  const [whole, frac = ""] = absStr.split(".");
  const fracPadded = `${frac}00`.slice(0, 2);
  const minor = Number.parseInt(`${whole}${fracPadded}`, 10);
  return negative ? -minor : minor;
};

export const sumMinor = (
  values: Array<string | number | undefined | null>
): number =>
  values.reduce<number>((acc, v) => {
    if (v === undefined || v === null) {
      return acc;
    }
    return acc + decimalStringToMinor(v);
  }, 0);

/** Format integer minor units back to a fixed-2dp decimal string. */
export const minorToDecimalString = (minor: number): string => {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
};
