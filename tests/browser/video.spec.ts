import { expect, test, type Page } from "@playwright/test";

/**
 * The video slice, end to end, on the playground's own video page.
 *
 * None of this is visible to a unit test. There is no decoder in node, no
 * `MediaRecorder`, and no canvas to capture a stream from — so "a trim takes the
 * part you asked for" can only be checked by opening a real clip, exporting it,
 * and looking at the pixels that came out.
 *
 * The sample is a second of red, a second of green and a second of blue, which
 * is what makes that check a one-pixel read rather than a guess.
 */

/** Recording runs at wall-clock speed, so these tests are slow on purpose. */
const REALTIME_BUDGET_MS = 60_000;

type Demo = {
  recordSampleClip(options?: { seconds?: number }): Promise<Blob>;
  openVideo(editor: unknown, input: Blob, options?: unknown): Promise<{ element: HTMLVideoElement; duration: number }>;
  exportClip(
    document: unknown,
    element: HTMLVideoElement,
    resources: unknown,
    options?: Record<string, unknown>,
  ): Promise<{ blob: Blob; width: number; height: number; duration: number; bytes: number; type: string }>;
  commands: { setClip(document: unknown, range: { start: number; end: number } | null): unknown };
  opened(): { element: HTMLVideoElement; duration: number } | null;
};

declare global {
  interface Window {
    pixenVideoDemo: Demo;
  }
}

async function openVideoPage(page: Page): Promise<void> {
  await page.goto("/video.html");
  await page.waitForFunction(() => Boolean(window.pixenVideoDemo));
  await page.waitForFunction(() => Boolean((document.querySelector("#editor") as { editor?: unknown })?.editor));
}

test.describe("video", () => {
  test.describe.configure({ timeout: REALTIME_BUDGET_MS });

  test("a video opens as the source, with its duration on the document", async ({ page }) => {
    await openVideoPage(page);

    const opened = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as HTMLElement & { editor: Record<string, never> };
      const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 2 });
      const source = await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "sample.webm" });
      const editor = element.editor as unknown as { document: { source: Record<string, number | string> } };
      return {
        document: editor.document.source,
        elementSize: [source.element.videoWidth, source.element.videoHeight],
        duration: source.duration,
      };
    });

    // The size came off the video element, not off a decode: there is nothing
    // to decode, because a video element is already a drawable source.
    expect(opened.document.width).toBe(opened.elementSize[0]);
    expect(opened.document.height).toBe(opened.elementSize[1]);
    expect(opened.document.width).toBeGreaterThan(0);

    // And the duration reached the document, which is what makes a clip possible
    // at all — `setClip` refuses a source that does not say how long it is.
    expect(opened.document.duration).toBeCloseTo(opened.duration, 3);
    expect(opened.duration).toBeGreaterThan(1);
  });

  test("the exported clip is the part that was trimmed to, not the whole source", async ({ page }) => {
    await openVideoPage(page);

    const outcome = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as HTMLElement & {
        editor: { document: unknown; dispatch(intent: unknown): unknown; resources: unknown };
      };
      const demo = window.pixenVideoDemo;

      // Three seconds: red, then green, then blue.
      const clip = await demo.recordSampleClip({ seconds: 3 });
      const source = await demo.openVideo(element.editor, clip);

      // Keep the middle second, inset from both edges so a frame either side of
      // the boundary cannot drift into the answer.
      element.dispatchEvent(new Event("noop"));
      (element.editor as { dispatch(intent: unknown): unknown }).dispatch({
        kind: "set-clip",
        range: { start: 1.2, end: 1.8 },
      });

      const written = await demo.exportClip(element.editor.document, source.element, element.editor.resources);

      // Read the exported file back and sample it in the middle.
      const played = document.createElement("video");
      played.muted = true;
      played.playsInline = true;
      played.src = URL.createObjectURL(written.blob);
      await new Promise((resolve) => {
        played.onloadedmetadata = resolve;
        played.onerror = resolve;
      });

      const read = document.createElement("canvas");
      read.width = written.width;
      read.height = written.height;
      const context = read.getContext("2d")!;
      const sampleAt = async (seconds: number) => {
        played.currentTime = seconds;
        await new Promise((resolve) => {
          played.onseeked = resolve;
          setTimeout(resolve, 2000);
        });
        context.drawImage(played, 0, 0, written.width, written.height);
        // A quarter in from the corner: the middle carries the burnt-in clock.
        const data = context.getImageData(Math.round(written.width / 4), Math.round(written.height / 4), 1, 1).data;
        return [data[0]!, data[1]!, data[2]!];
      };

      return {
        sourceDuration: source.duration,
        written: { width: written.width, height: written.height, bytes: written.bytes, type: written.type },
        reportedDuration: written.duration,
        exportedDuration: played.duration,
        first: await sampleAt(0.05),
        middle: await sampleAt(0.3),
      };
    });

    // A real file came out, in the container the measurement said to expect.
    expect(outcome.written.bytes).toBeGreaterThan(0);
    expect(outcome.written.type).toContain("webm");
    expect(outcome.written.width).toBeGreaterThan(0);

    // The clip is the trimmed length, not the source's three seconds.
    expect(outcome.sourceDuration).toBeGreaterThan(2.5);
    expect(outcome.reportedDuration).toBeCloseTo(0.6, 1);
    expect(outcome.exportedDuration).toBeLessThan(1.5);

    // And it is green throughout — the second that was asked for, rather than
    // the red one it starts with or the blue one it ends with.
    for (const [label, sample] of [
      ["first", outcome.first],
      ["middle", outcome.middle],
    ] as const) {
      const [r, g, b] = sample;
      expect(g, `${label} frame is green`).toBeGreaterThan(r);
      expect(g, `${label} frame is green`).toBeGreaterThan(b);
    }
  });

  test("an export can be called off while it is recording", async ({ page }) => {
    await openVideoPage(page);

    const outcome = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as HTMLElement & {
        editor: { document: unknown; resources: unknown };
      };
      const demo = window.pixenVideoDemo;
      const clip = await demo.recordSampleClip({ seconds: 3 });
      const source = await demo.openVideo(element.editor, clip);

      const controller = new AbortController();
      const started = performance.now();
      // Recording is realtime, so there is a whole clip's worth of time to
      // change your mind in — which is the reason it can be cancelled at all.
      setTimeout(() => controller.abort(), 300);

      try {
        await demo.exportClip(element.editor.document, source.element, element.editor.resources, {
          signal: controller.signal,
        });
        return { outcome: "finished", elapsed: performance.now() - started };
      } catch (error) {
        return {
          outcome: "threw",
          code: (error as { code?: string }).code ?? null,
          elapsed: performance.now() - started,
        };
      }
    });

    expect(outcome.outcome).toBe("threw");
    expect(outcome.code).toBe("ABORTED");
    // Stopped where it was asked to, rather than running the clip out first.
    expect(outcome.elapsed).toBeLessThan(2500);
  });
});
