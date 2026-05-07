/**
 * @ai-cfo/metrics money helpers.
 *
 * The canonical orders/refunds tables store monetary values as `numeric(14,2)`
 * which Drizzle/postgres-js hands us back as decimal strings. We parse those
 * strings to integer minor units (cents) once at the boundary, then operate
 * exclusively in Dinero.js — Iron Rule #1 (the deterministic-truth layer
 * never trips on float math).
 *
 * Day-1 supports scale-2 currencies (USD/EUR/GBP/AUD/CAD/etc.). JPY (scale 0)
 * and a handful of others are TODO; we'll add a per-currency scale lookup
 * before onboarding a brand selling in them.
 */

import { USD } from "@dinero.js/currencies";
import {
  add,
  type Dinero,
  type DineroSnapshot,
  dinero,
  toSnapshot,
} from "dinero.js";

const SCALE_2_RE = /^-?\d+(\.\d{1,2})?$/;

const SUPPORTED_CURRENCIES: Record<string, typeof USD> = {
  USD,
};

const currencyOrThrow = (code: string) => {
  const c = SUPPORTED_CURRENCIES[code.toUpperCase()];
  if (!c) {
    throw new Error(
      `@ai-cfo/metrics: currency '${code}' not supported in Day-1 — add to SUPPORTED_CURRENCIES with its ISO 4217 minor-unit scale before onboarding`
    );
  }
  return c;
};

/** Parse a numeric(14,2) string into integer minor units. */
export const decimalStringToMinor = (value: string): number => {
  if (!SCALE_2_RE.test(value)) {
    throw new Error(
      `@ai-cfo/metrics: refusing to silently round '${value}' (>2dp)`
    );
  }
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [whole, frac = ""] = abs.split(".");
  const fracPadded = `${frac}00`.slice(0, 2);
  const minor = Number.parseInt(`${whole}${fracPadded}`, 10);
  return negative ? -minor : minor;
};

export const dineroFromMinor = (
  minor: number,
  currencyCode: string
): Dinero<number> =>
  dinero({ amount: minor, currency: currencyOrThrow(currencyCode) });

export const dineroZero = (currencyCode: string): Dinero<number> =>
  dineroFromMinor(0, currencyCode);

export const sumDinero = (values: Dinero<number>[]): Dinero<number> | null => {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((acc, v) => add(acc, v));
};

/** Convert back to a `numeric(14,2)`-compatible string for DB writes. */
export const dineroToDecimalString = (d: Dinero<number>): string => {
  const snap: DineroSnapshot<number> = toSnapshot(d);
  // Dinero v2 always normalises scale; for scale-2 currencies the snapshot
  // amount is in cents.
  const negative = snap.amount < 0;
  const abs = Math.abs(snap.amount);
  // Power 10^scale from the snapshot rather than hard-coding 100, so JPY-
  // like scales work when we add them later.
  const factor = 10 ** snap.scale;
  const whole = Math.floor(abs / factor);
  const frac = (abs % factor).toString().padStart(snap.scale, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
};
