import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The Day-1 idempotency tests hit a real Supabase project; keep
    // sequential to avoid flaky state interleaving.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // `server-only` is a Next.js bundler-side guard that throws at import
      // time. Replace with a no-op so backend integration tests can pull in
      // packages/database (which marks itself "server-only").
      "server-only": new URL("./test-shims/server-only.ts", import.meta.url)
        .pathname,
    },
  },
});
