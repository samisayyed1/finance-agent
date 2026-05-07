/**
 * OAuth state HMAC. The Shopify install flow round-trips a `state` query
 * param to defeat CSRF. We sign `<orgId>|<shop>|<nonce>|<expiresAt>` with
 * SHOPIFY_API_SECRET and rely on the constant-time compare in WebCrypto.
 */

const textEncoder = new TextEncoder();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
};

const importKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    toArrayBuffer(textEncoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

const bytesToB64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary)
    .replace(B64_PLUS_RE, "-")
    .replace(B64_SLASH_RE, "_")
    .replace(B64_PAD_RE, "");
};

const B64_PLUS_RE = /\+/g;
const B64_SLASH_RE = /\//g;
const B64_PAD_RE = /=+$/;
const B64_DASH_RE = /-/g;
const B64_USCORE_RE = /_/g;

const b64UrlToBytes = (s: string): Uint8Array => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const std = (s + pad).replace(B64_DASH_RE, "+").replace(B64_USCORE_RE, "/");
  return Uint8Array.from(atob(std), (c) => c.charCodeAt(0));
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time compare requires |= and ^
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
};

export interface StatePayload {
  expiresAt: number;
  nonce: string;
  orgId: string;
  shop: string;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const buildState = async (args: {
  orgId: string;
  shop: string;
  secret: string;
}): Promise<string> => {
  const { orgId, shop, secret } = args;
  const nonce = bytesToB64Url(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = Date.now() + FIVE_MINUTES_MS;
  const body = `${orgId}|${shop}|${nonce}|${expiresAt}`;
  const key = await importKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      toArrayBuffer(textEncoder.encode(body))
    )
  );
  return `${bytesToB64Url(textEncoder.encode(body))}.${bytesToB64Url(sig)}`;
};

export const verifyState = async (args: {
  state: string;
  secret: string;
}): Promise<StatePayload | null> => {
  const { state, secret } = args;
  const [bodyB64, sigB64] = state.split(".");
  if (!(bodyB64 && sigB64)) {
    return null;
  }
  const body = new TextDecoder().decode(b64UrlToBytes(bodyB64));
  const sigBytes = b64UrlToBytes(sigB64);
  const key = await importKey(secret);
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
  const [orgId, shop, nonce, expiresAtRaw] = body.split("|");
  const expiresAt = Number(expiresAtRaw);
  if (
    !(orgId && shop && nonce && Number.isFinite(expiresAt)) ||
    expiresAt < Date.now()
  ) {
    return null;
  }
  return { orgId, shop, nonce, expiresAt };
};
