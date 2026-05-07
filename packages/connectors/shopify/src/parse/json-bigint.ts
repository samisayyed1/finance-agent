/**
 * Bigint-safe JSON parser for Shopify webhook payloads.
 *
 * Shopify ids (orders, line items, refunds, transactions) are 64-bit integers
 * that exceed `Number.MAX_SAFE_INTEGER` (2^53 - 1). Plain `JSON.parse()`
 * silently rounds them. We use `lossless-json` and convert any
 * potentially-large numeric to a string at parse time, preserving full
 * precision through Zod (which already accepts `z.union([z.number(),
 * z.string()])` for ids) and downstream into the canonical `source_*_id`
 * text columns.
 */
import { LosslessNumber, parse as losslessParse } from "lossless-json";

const reviver = (_key: string, value: unknown): unknown => {
  if (value instanceof LosslessNumber) {
    // Decide: if it fits in a JS number safely AND has no fractional part, we
    // keep it as a number for tax / quantity / etc. Anything else (large ids,
    // money values that already arrive as strings on Shopify so this is rare)
    // becomes a string.
    const str = value.toString();
    if (!(str.includes(".") || str.includes("e") || str.includes("E"))) {
      const n = Number(str);
      if (Number.isSafeInteger(n)) {
        return n;
      }
      return str;
    }
    const n = Number(str);
    if (Number.isFinite(n)) {
      return n;
    }
    return str;
  }
  return value;
};

export const parseJsonBigintSafe = (raw: string): unknown =>
  losslessParse(raw, reviver);
