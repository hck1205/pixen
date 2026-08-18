import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Sandboxes and CI images often ship a Chromium that Playwright did not install
 * itself. Point PIXEN_CHROMIUM_PATH at it (or leave the well-known path in
 * place) and the suite uses that binary instead of downloading one.
 */
const chromiumPath = process.env.PIXEN_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = existsSync(chromiumPath) ? chromiumPath : undefined;

/**
 * Browser tests run against the playground build, which is the same code path a
 * customer integrates. Unit tests cover the maths; these cover the parts only a
 * real engine can answer — canvas rendering, pointer gestures, encoding.
 */
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: undefined } }],
  webServer: {
    command: "pnpm --filter @pixen/playground preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
