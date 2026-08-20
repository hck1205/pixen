import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const entry = (name: string) => fileURLToPath(new URL(name, import.meta.url));

/** Source aliases keep the playground hot-reloading against the packages themselves. */
export default defineConfig({
  resolve: {
    alias: {
      "@pixen/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@pixen/web": fileURLToPath(new URL("../../packages/web/src/index.ts", import.meta.url)),
      "@pixen/video": fileURLToPath(new URL("../../packages/video/src/index.ts", import.meta.url)),
    },
  },
  // Two pages, because a video is a different demo and a different fixture: the
  // still editor should not have to load a recorder to show a photograph.
  build: { rollupOptions: { input: { main: entry("index.html"), video: entry("video.html") } } },
  server: { port: 5173, host: true },
});
