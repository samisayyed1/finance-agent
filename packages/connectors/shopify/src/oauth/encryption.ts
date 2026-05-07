/**
 * AES-256-GCM envelope encryption for OAuth tokens at rest in
 * `data_connections.encrypted_credentials`.
 *
 * Day-1 keying: a single env-var `DATA_CONNECTION_ENCRYPTION_KEY` (base64,
 * 32 bytes). TODO: migrate to a real KMS (AWS KMS, Google KMS, or Cloudflare
 * Workers Vault) before any production tenant is onboarded — the env-var
 * approach is fine for dev + private alpha but rotates manually and lives in
 * the same blast radius as the app server. Tracking issue in
 * `docs/runbooks/SHOPIFY_PARTNER_APP_SETUP.md`.
 *
 * Wire format: base64( iv (12 bytes) ‖ ciphertext ‖ authTag (16 bytes) ).
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;

const decodeKey = (envValue: string): Uint8Array => {
  const bytes = Uint8Array.from(atob(envValue), (c) => c.charCodeAt(0));
  if (bytes.byteLength !== KEY_BYTES) {
    throw new Error(
      `DATA_CONNECTION_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${bytes.byteLength}). Generate with: openssl rand -base64 32`
    );
  }
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  // WebCrypto requires a plain ArrayBuffer (not a Uint8Array<ArrayBufferLike>
  // — Node 20+ types could resolve to SharedArrayBuffer). Slice into a
  // brand-new ArrayBuffer; cheap (32 bytes for the key, IV-sized for nonces).
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
};

const importKey = (envValue: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    toArrayBuffer(decodeKey(envValue)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const encryptCredential = async (
  plaintext: string,
  envKey: string
): Promise<string> => {
  const key = await importKey(envKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(new TextEncoder().encode(plaintext))
    )
  );
  const out = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(ciphertext, iv.byteLength);
  return bytesToBase64(out);
};

export const decryptCredential = async (
  envelope: string,
  envKey: string
): Promise<string> => {
  const key = await importKey(envKey);
  const bytes = base64ToBytes(envelope);
  const iv = bytes.slice(0, IV_BYTES);
  const ciphertext = bytes.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext)
  );
  return new TextDecoder().decode(plain);
};
