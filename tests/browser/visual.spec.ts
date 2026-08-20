import { expect, test, type Page } from "@playwright/test";

/**
 * Golden images over the stories.
 *
 * The stories are already the reference for what the UI should look like, so
 * this photographs them rather than inventing a second set of fixtures. It is
 * opt-in — `pnpm test:visual` — because a baseline is only as portable as the
 * renderer that recorded it; see docs/TESTING.md.
 */
const STORIES = [
  "editor--playground",
  "editor--themes",
  "editor--annotations",
  "editor--redaction-modes",
  "editor--decoration",
  "editor--presets",
  "editor--layer-handles",
  "editor--styling",
  "editor--layers",
  "editor--output",
  "editor--round-trip",
  "editor--locales",
  "design--icons",
  "design--palette",
] as const;

/** Long enough for the sample to be drawn, decoded, loaded and fitted. */
const SETTLE_MS = 2500;

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`http://127.0.0.1:4174/?story=${story}&mode=preview`, { waitUntil: "networkidle" });
  // The editors draw their own sample; nothing is stable until they have.
  await page.waitForTimeout(SETTLE_MS);
  // Caret blink and any transition would otherwise differ between runs.
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });
}

test.describe("visual regression", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const story of STORIES) {
    test(story, async ({ page }) => {
      await openStory(page, story);
      await expect(page).toHaveScreenshot(`${story}.png`, { fullPage: true });
    });
  }
});
