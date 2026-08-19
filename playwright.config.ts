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
const BROWSER_PROJECTS = {
  chromium: { name: "chromium", use: { ...devices["Desktop Chrome"], channel: undefined } },
  firefox: { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  webkit: { name: "webkit", use: { ...devices["Desktop Safari"] } },
  "mobile-chrome": { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  "mobile-safari": { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
} as const;

function selectedProjects() {
  const requested = (process.env.PIXEN_BROWSERS ?? "chromium").split(",").map((name) => name.trim());
  const names =
    requested.includes("all") ? (Object.keys(BROWSER_PROJECTS) as Array<keyof typeof BROWSER_PROJECTS>) : requested;

  const projects = names
    .map((name) => BROWSER_PROJECTS[name as keyof typeof BROWSER_PROJECTS])
    .filter((project): project is (typeof BROWSER_PROJECTS)[keyof typeof BROWSER_PROJECTS] => Boolean(project));

  return projects.length > 0 ? projects : [BROWSER_PROJECTS.chromium];
}

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...(executablePath && (process.env.PIXEN_BROWSERS ?? "chromium") === "chromium"
      ? { launchOptions: { executablePath } }
      : {}),
  },
  /**
   * Chromium runs everywhere by default. `PIXEN_BROWSERS=all` (or a comma
   * separated list) adds WebKit and Firefox, which is how the support matrix in
   * docs/BROWSER-SUPPORT.md is checked before a release. WebKit stands in for
   * Safari; it is not Safari, so device testing still matters.
   */
  projects: selectedProjects(),
  /**
   * The visual suite is opt-in.
   *
   * Golden images are only as stable as the renderer that made them, and font
   * rasterisation differs between machines — a baseline recorded here would be a
   * red build on someone else's. `PIXEN_VISUAL=1` turns it on, for a run inside
   * the image the baselines were recorded in; see docs/TESTING.md.
   */
  testIgnore: process.env.PIXEN_VISUAL ? [] : ["**/visual.spec.ts"],

  expect: {
    toHaveScreenshot: {
      // Tight on purpose. A looser ratio passed a build with the accent colour
      // changed from blue to pink, because the accent covers well under one
      // per cent of the page — a threshold that forgiving forgives regressions.
      maxDiffPixelRatio: 0.0005,
      threshold: 0.15,
    },
  },

  /**
   * Never reuse a preview server.
   *
   * `ladle preview` resolves the build once at startup, so a server left over
   * from an earlier run serves the *previous* bundle — and a suite photographing
   * a stale build passes no matter what the change did. A port already in use
   * fails loudly here, which is the outcome worth having.
   */
  webServer: [
    {
      command: "pnpm --filter @pixen/playground preview -- --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The story browser: the visual suite photographs it, because the stories
      // are already the reference for what the UI should look like.
      command: "pnpm --filter @pixen/stories exec ladle preview --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
