/**
 * Google Ads reports money in MICROS (1/1,000,000 of the account's currency
 * unit) as a 64-bit integer. Convert to a 2-decimal currency string with
 * cents-as-integer math — never floating point.
 *
 * Examples:
 *   1234560000  → "1234.56"
 *   100         → "0.00"   (100 micros = 0.0001 — sub-cent rounds to 0)
 *   12345678    → "12.35"  (rounds nearest cent: 12345678 / 1e4 = 1234.5678 cents)
 *   -50000000   → "-50.00"
 *   0           → "0.00"
 */

const INTEGER_STRING_RE = /^-?\d+$/;

export const costMicrosToDecimalString = (
  micros: number | bigint | string
): string => {
  // Normalize to BigInt to handle Google's 64-bit values without precision loss.
  let big: bigint;
  if (typeof micros === "bigint") {
    big = micros;
  } else if (typeof micros === "number") {
    if (!Number.isFinite(micros)) {
      throw new Error(`costMicrosToDecimalString: not finite (${micros})`);
    }
    big = BigInt(Math.trunc(micros));
  } else {
    if (!INTEGER_STRING_RE.test(micros)) {
      throw new Error(
        `costMicrosToDecimalString: not an integer string ('${micros}')`
      );
    }
    big = BigInt(micros);
  }
  const negative = big < 0n;
  const abs = negative ? -big : big;
  // Convert micros → cents. micros / 10000 = cents (integer division with
  // round-to-nearest via half-up).
  const TEN_THOUSAND = 10_000n;
  const half = 5_000n;
  const cents = (abs + half) / TEN_THOUSAND;
  const dollars = cents / 100n;
  const remainder = cents % 100n;
  const sign = negative && cents > 0n ? "-" : "";
  return `${sign}${dollars.toString()}.${remainder.toString().padStart(2, "0")}`;
};
