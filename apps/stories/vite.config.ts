import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * Stories run against the packages' source, not their build output, so editing
 * the engine or the element hot-reloads straight into the story.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@pixen/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@pixen/web": fileURLToPath(new URL("../../packages/web/src/index.ts", import.meta.url)),
      "@pixen/react": fileURLToPath(new URL("../../packages/react/src/index.tsx", import.meta.url)),
      "@pixen/video": fileURLToPath(new URL("../../packages/video/src/index.ts", import.meta.url)),
    },
  },
});
