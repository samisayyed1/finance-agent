// Vitest shim: replaces Next.js `server-only` import-time guard with a no-op
// so backend integration tests can import @ai-cfo/database (which marks
// itself server-only).
export {};
