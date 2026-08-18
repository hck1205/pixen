import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@pixen/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
    },
  },
});
