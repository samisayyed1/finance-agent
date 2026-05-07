/**
 * OAuth state HMAC — shared across connectors.
 *
 * The install flow round-trips a `state` query param to defeat CSRF. We
 * sign `<orgId>|<source>|<extra>|<nonce>|<expiresAt>` with a per-source
 * secret and rely on a constant-time compare on the way back.
 *
 * `extra` lets per-source flows carry one extra string (e.g. Shopify's
 * shop domain) into the verified payload without re-implementing.
 */

const textEncoder = new TextEncoder();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
};

const importKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    toArrayBuffer(textEncoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

const B64URL_PAD_RE = /=+$/;
const B64URL_PLUS_RE = /\+/g;
const B64URL_SLASH_RE = /\//g;
const B64URL_DASH_RE = /-/g;
const B64URL_USCORE_RE = /_/g;

const bytesToB64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(bin)
    .replace(B64URL_PLUS_RE, "-")
    .replace(B64URL_SLASH_RE, "_")
    .replace(B64URL_PAD_RE, "");
};

const b64UrlToBytes = (s: string): Uint8Array => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const std = (s + pad)
    .replace(B64URL_DASH_RE, "+")
    .replace(B64URL_USCORE_RE, "/");
  return Uint8Array.from(atob(std), (c) => c.charCodeAt(0));
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time compare
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
};

export interface OAuthStatePayload {
  expiresAt: number;
  extra: string;
  nonce: string;
  orgId: string;
  source: string;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const buildOAuthState = async (args: {
  orgId: string;
  source: string;
  extra?: string;
  secret: string;
  ttlMs?: number;
}): Promise<string> => {
  const extra = args.extra ?? "";
  const expiresAt = Date.now() + (args.ttlMs ?? FIVE_MINUTES_MS);
  const nonce = bytesToB64Url(crypto.getRandomValues(new Uint8Array(16)));
  const body = `${args.orgId}|${args.source}|${extra}|${nonce}|${expiresAt}`;
  const key = await importKey(args.secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      toArrayBuffer(textEncoder.encode(body))
    )
  );
  return `${bytesToB64Url(textEncoder.encode(body))}.${bytesToB64Url(sig)}`;
};

export const verifyOAuthState = async (args: {
  state: string;
  secret: string;
  expectedSource: string;
}): Promise<OAuthStatePayload | null> => {
  const [bodyB64, sigB64] = args.state.split(".");
  if (!(bodyB64 && sigB64)) {
    return null;
  }
  const body = new TextDecoder().decode(b64UrlToBytes(bodyB64));
  const sigBytes = b64UrlToBytes(sigB64);
  const key = await importKey(args.secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      toArrayBuffer(textEncoder.encode(body))
    )
  );
  if (!constantTimeEqual(sigBytes, expected)) {
    return null;
  }
  const [orgId, source, extra, nonce, expiresAtRaw] = body.split("|");
  const expiresAt = Number(expiresAtRaw);
  if (
    !(orgId && source && nonce && Number.isFinite(expiresAt)) ||
    expiresAt < Date.now() ||
    source !== args.expectedSource
  ) {
    return null;
  }
  return { orgId, source, extra: extra ?? "", nonce, expiresAt };
};
