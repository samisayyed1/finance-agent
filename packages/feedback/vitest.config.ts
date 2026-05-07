import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "server-only": new URL("./test-shims/server-only.ts", import.meta.url)
        .pathname,
    },
  },
});
