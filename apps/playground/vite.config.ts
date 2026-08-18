import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/** Source aliases keep the playground hot-reloading against the packages themselves. */
export default defineConfig({
  resolve: {
    alias: {
      "@pixen/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@pixen/web": fileURLToPath(new URL("../../packages/web/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173, host: true },
});
