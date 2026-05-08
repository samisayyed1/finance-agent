import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": new URL("./test-shims/server-only.ts", import.meta.url)
        .pathname,
    },
  },
});
