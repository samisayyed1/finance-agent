/**
 * Shopify webhook HMAC verification using WebCrypto (no node:crypto). Works
 * identically under Bun, Node 20+, and edge runtimes.
 *
 * Shopify signs the *raw* request body with the app's API secret and base64-
 * encodes it into the `X-Shopify-Hmac-Sha256` header. We compute our own,
 * then constant-time-compare. We accept either a `string` or `Uint8Array`
 * body — but the bytes MUST be the exact bytes we received before any JSON
 * parsing.
 */

const textEncoder = new TextEncoder();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  // WebCrypto wants `BufferSource` whose underlying buffer is a plain
  // ArrayBuffer. Node 20+ types resolve typed-array buffers as
  // `ArrayBufferLike` (could be SharedArrayBuffer). Copy into a fresh
  // ArrayBuffer so the type — and the runtime invariant — both hold.
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

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export interface VerifyWebhookArgs {
  hmacHeader: string | null | undefined;
  rawBody: string | Uint8Array;
  secret: string;
}

export const verifyShopifyWebhook = async ({
  rawBody,
  hmacHeader,
  secret,
}: VerifyWebhookArgs): Promise<boolean> => {
  if (!hmacHeader) {
    return false;
  }
  const key = await importKey(secret);
  const bodyBytes =
    typeof rawBody === "string" ? textEncoder.encode(rawBody) : rawBody;
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toArrayBuffer(bodyBytes))
  );
  let expected: Uint8Array;
  try {
    expected = base64ToBytes(hmacHeader.trim());
  } catch {
    return false;
  }
  return constantTimeEqual(signature, expected);
};
