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
  recordSampleClip(options?: { seconds?: number; withSound?: boolean }): Promise<Blob>;
  openVideo(
    editor: unknown,
    input: Blob | string,
    options?: unknown,
  ): Promise<{ element: HTMLVideoElement; duration: number }>;
  exportClip(
    document: unknown,
    element: HTMLVideoElement,
    resources: unknown,
    options?: Record<string, unknown>,
  ): Promise<{
    blob: Blob;
    width: number;
    height: number;
    duration: number;
    bytes: number;
    type: string;
    hasSound: boolean;
  }>;
  exportMedia(
    document: unknown,
    resources: unknown,
    options?: Record<string, unknown>,
  ): Promise<{ kind: string; width: number; height: number; bytes: number; duration?: number }>;
};

declare global {
  interface Window {
    pixenVideoDemo: Demo;
  }
}

/**
 * The editor, as this suite uses it.
 *
 * Declared once. Four tests each cast `#editor` to a different shape — three
 * fields, then two, then two others — so they disagreed about what the element
 * is, and a change to the demo surface had to be found in four places.
 * `check:duplication` cannot see this: its scan covers `packages/*` and
 * `apps/*`, not `tests/`.
 *
 * The type is shared; the lookup is not. Everything inside `page.evaluate` runs
 * in the browser, where nothing declared out here exists at run time — a helper
 * would be a `ReferenceError`, and only the type survives the boundary.
 */
type VideoEditor = HTMLElement & {
  editor: {
    document: { source: { resourceId: string; width: number; height: number; duration: number } };
    dispatch(intent: unknown): unknown;
    resources: { dispose(id: string): void };
  };
};


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
      const element = document.querySelector("#editor") as VideoEditor;
      const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 2 });
      const source = await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "sample.webm" });
      return {
        document: element.editor.document.source,
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
      const element = document.querySelector("#editor") as VideoEditor;
      const demo = window.pixenVideoDemo;

      // Three seconds: red, then green, then blue.
      const clip = await demo.recordSampleClip({ seconds: 3 });
      const source = await demo.openVideo(element.editor, clip);

      // Keep the middle second, inset from both edges so a frame either side of
      // the boundary cannot drift into the answer.
      element.editor.dispatch({
        kind: "set-clip",
        range: { start: 1.2, end: 1.8 },
      });

      const startedAt = performance.now();
      const written = await demo.exportClip(element.editor.document, source.element, element.editor.resources);
      const elapsed = performance.now() - startedAt;

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
        elapsed,
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

    // The clip is the trimmed length, not the source's three seconds — read off
    // the decoded file, which is the only one of the two that can disagree with
    // the exporter. `written.duration` is the input range restated, so it would
    // hold even if nothing had been recorded at all.
    expect(outcome.sourceDuration).toBeGreaterThan(2.5);
    // Bounds rather than a tolerance: recording is realtime, so the file ends on
    // the last frame that made it and runs a frame or two short of the 0.6s
    // asked for. What has to hold is that it is the trimmed part and not the
    // three-second source, which these bounds separate and a tight tolerance
    // only made flaky.
    expect(outcome.exportedDuration).toBeGreaterThan(0.35);
    expect(outcome.exportedDuration).toBeLessThan(0.9);

    // And it took about as long as the clip runs for, because recording is
    // realtime — the cost the package documents, asserted rather than described.
    expect(outcome.elapsed).toBeGreaterThan(outcome.reportedDuration * 1000 * 0.5);

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

  test("letting the source go releases the file it was reading from", async ({ page }) => {
    await openVideoPage(page);

    const outcome = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as VideoEditor;
      const demo = window.pixenVideoDemo;
      const clip = await demo.recordSampleClip({ seconds: 1 });
      const source = await demo.openVideo(element.editor, clip);

      const url = source.element.src;
      const readable = async (): Promise<boolean> => {
        try {
          const response = await fetch(url);
          return response.ok;
        } catch {
          return false;
        }
      };

      // While the resource is alive the element is still reading from it.
      const before = await readable();
      element.editor.resources.dispose(element.editor.document.source.resourceId);
      // A revoked object URL stops resolving, which is the observable half of
      // "the file is no longer being held in memory".
      const after = await readable();
      return { url: url.startsWith("blob:"), before, after, src: source.element.getAttribute("src") };
    });

    expect(outcome.url).toBe(true);
    expect(outcome.before).toBe(true);
    expect(outcome.after).toBe(false);
    // And the element is not left pointing at bytes that are gone.
    expect(outcome.src).toBeNull();
  });

  /**
   * The seam that exists because Pixen's own recorder has costs a host may not
   * accept — realtime, and WebM only. It was declared, documented and never
   * driven by anything, which for a seam is the same as not having one.
   */
  test("a host's own recorder receives the frames, and its file is the one returned", async ({ page }) => {
    await openVideoPage(page);

    const outcome = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as VideoEditor;
      const demo = window.pixenVideoDemo;
      const clip = await demo.recordSampleClip({ seconds: 1 });
      const source = await demo.openVideo(element.editor, clip);

      const calls: string[] = [];
      let frames = 0;
      let sawPixels = false;

      const written = await demo.exportClip(element.editor.document, source.element, element.editor.resources, {
        recorder: (canvas: HTMLCanvasElement) => ({
          start: () => calls.push("start"),
          frame: () => {
            frames += 1;
            // The canvas handed over is the one being painted, not a blank.
            if (!sawPixels) {
              const data = canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data;
              sawPixels = data[3]! > 0;
            }
          },
          finish: () => {
            calls.push("finish");
            return Promise.resolve(new Blob(["host's own bytes"], { type: "video/mp4" }));
          },
          cancel: () => calls.push("cancel"),
        }),
      });

      const text = await written.blob.text();
      return { calls, frames, sawPixels, text, type: written.type, bytes: written.bytes };
    });

    // Started once, finished once, and never cancelled — the export succeeded.
    expect(outcome.calls).toEqual(["start", "finish"]);
    // Frames actually arrived, and on a canvas with the picture already on it.
    expect(outcome.frames).toBeGreaterThan(0);
    expect(outcome.sawPixels).toBe(true);

    // What the host wrote is what came back, including a container Pixen's own
    // recorder cannot produce — which is the entire point of the seam.
    expect(outcome.text).toBe("host's own bytes");
    expect(outcome.type).toBe("video/mp4");
    expect(outcome.bytes).toBeGreaterThan(0);
  });

  test("a recorder that fails takes the export down with it, rather than returning nothing", async ({ page }) => {
    await openVideoPage(page);

    const outcome = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as VideoEditor;
      const demo = window.pixenVideoDemo;
      const clip = await demo.recordSampleClip({ seconds: 1 });
      const source = await demo.openVideo(element.editor, clip);

      let cancelled = false;
      try {
        await demo.exportClip(element.editor.document, source.element, element.editor.resources, {
          recorder: () => ({
            start: () => undefined,
            frame: () => undefined,
            finish: () => Promise.reject(new Error("the encoder gave up")),
            cancel: () => {
              cancelled = true;
            },
          }),
        });
        return { outcome: "returned a file", cancelled };
      } catch (error) {
        return { outcome: "threw", message: (error as Error).message, cancelled };
      }
    });

    // An export that cannot write a file says so. Handing back an empty one is
    // the worst failure an export API has, because it is indistinguishable from
    // success until somebody opens it.
    expect(outcome.outcome).toBe("threw");
    // And the recorder is told to let go of whatever it had.
    expect(outcome.cancelled).toBe(true);
  });

  test("an export can be called off while it is recording", async ({ page }) => {
    await openVideoPage(page);

    const outcome = await page.evaluate(async () => {
      const element = document.querySelector("#editor") as VideoEditor;
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

test("one call exports whichever kind of picture the document turns out to be", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  await openVideoPage(page);
  // A host that accepts both should not have to know which of two functions to
  // call, or state the size and the progress reporter twice.
  const still = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const paint = canvas.getContext("2d")!;
    paint.fillStyle = "#3366cc";
    paint.fillRect(0, 0, 320, 240);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!), "image/png"));
    await (element as unknown as { load(input: Blob): Promise<void> }).load(blob);

    const stages: string[] = [];
    const result = await window.pixenVideoDemo.exportMedia(element.editor.document, element.editor.resources, {
      size: { width: 160, height: 120 },
      onProgress: (report: { stage: string }) => stages.push(report.stage),
      image: { format: "image/png" },
    });
    return { kind: result.kind, width: result.width, height: result.height, stages: [...new Set(stages)] };
  });

  expect(still.kind).toBe("image");
  // The size crossed over as a box and came out as axes.
  expect({ width: still.width, height: still.height }).toEqual({ width: 160, height: 120 });
  expect(still.stages).toContain("encode");

  const moving = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 1 });
    const opened = await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "sample.webm" });
    const result = await window.pixenVideoDemo.exportMedia(element.editor.document, element.editor.resources, {
      size: { width: 120, height: 68 },
      element: opened.element,
    });
    return { kind: result.kind, width: result.width, bytes: result.bytes, duration: result.duration };
  });

  expect(moving.kind).toBe("video");
  expect(moving.width).toBe(120);
  expect(moving.bytes).toBeGreaterThan(0);
  expect(moving.duration).toBeGreaterThan(0);
});

test("a moving document says what it needs rather than exporting a frame of it", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  await openVideoPage(page);
  const message = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 1 });
    await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "sample.webm" });
    try {
      // No element: the one thing a clip export cannot do without.
      await window.pixenVideoDemo.exportMedia(element.editor.document, element.editor.resources, {});
      return "no error";
    } catch (error) {
      return (error as { code?: string }).code ?? String(error);
    }
  });

  // Named, not a TypeError from somewhere inside: a host reads this code.
  expect(message).toBe("INVALID_STATE");
});

test("the trim strip sets the clip, in the language the editor is in", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  await openVideoPage(page);

  const editor = page.locator("#editor");
  const strip = editor.locator('[role="group"] input[data-handle="start"]');

  // A still picture has no clip, so the strip is not there to be dragged.
  await expect(strip).toHaveCount(0);

  await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 2 });
    await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "sample.webm" });
  });
  await expect(strip).toHaveCount(1);

  // Its labels are the plugin's own, and they follow the element's locale.
  await expect(strip).toHaveAttribute("aria-label", "Start");
  await page.evaluate(() => document.querySelector("#editor")!.setAttribute("locale", "ko"));
  await expect(editor.locator('input[data-handle="start"]')).toHaveAttribute("aria-label", "시작");

  const before = await page.evaluate(() => {
    const element = document.querySelector("#editor") as VideoEditor;
    return {
      clip: element.editor.document.clip,
      depth: (element.editor as unknown as { historyState: { depth: number } }).historyState.depth,
    };
  });

  // Drag the start handle to the middle of the strip.
  const box = (await editor.locator('input[data-handle="start"]').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const element = document.querySelector("#editor") as VideoEditor;
    return {
      clip: (element.editor.document.clip as { start: number; end: number }[] | null)?.[0] ?? null,
      duration: element.editor.document.source.duration as number,
      depth: (element.editor as unknown as { historyState: { depth: number } }).historyState.depth,
    };
  });

  expect(before.clip).toBeNull();
  expect(after.clip).not.toBeNull();
  // Somewhere near the middle, and still inside the source.
  expect(after.clip!.start).toBeGreaterThan(after.duration * 0.2);
  expect(after.clip!.start).toBeLessThan(after.clip!.end);
  // However many times the value changed on the way, the drag is one step.
  expect(after.depth - before.depth).toBe(1);
});

/**
 * The worst thing an export can do is succeed at nothing.
 *
 * A clip on a CDN is the ordinary deployment. Without an
 * `Access-Control-Allow-Origin` header it taints the canvas the moment its
 * first frame is drawn — after `captureStream` has already accepted a canvas
 * that was clean — and the capture track then goes quiet. `MediaRecorder`
 * writes a 110-byte header for that, and the emptiness check in `finish` asks
 * whether the file is zero bytes, so it came back as a successful export: a
 * duration, a size, a type, and a file no player will open.
 */
test("a clip from another origin is refused rather than exported as an empty header", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  await openVideoPage(page);

  const bytes = await page.evaluate(async () => {
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 1 });
    return [...new Uint8Array(await clip.arrayBuffer())];
  });
  // The same bytes, from an origin the page is not. That is all CORS is.
  await page.route("http://pixen.test/clip.webm", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "video/webm" }, body: Buffer.from(bytes) }),
  );

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const source = await window.pixenVideoDemo.openVideo(element.editor, "http://pixen.test/clip.webm", {
      name: "remote.webm",
    });
    const readyState = source.element.readyState;
    try {
      const written = await window.pixenVideoDemo.exportClip(
        element.editor.document,
        source.element,
        element.editor.resources,
      );
      return { readyState, code: "no error", bytes: written.bytes };
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      return { readyState, code: failure.code ?? String(error), message: failure.message ?? "", bytes: 0 };
    }
  });

  expect(outcome.code).toBe("CORS_ERROR");
  // No file at all, rather than one that opens as nothing.
  expect(outcome.bytes).toBe(0);
  // The remedy is two-sided, and a host reading only the message needs both.
  expect(outcome.message).toContain("Access-Control-Allow-Origin");
  expect(outcome.message).toContain("crossOrigin");
  // Recorded so the fixture is checkable: the element never got past its header.
  expect(outcome.readyState).toBeLessThan(2);
});

/**
 * Recording a canvas records a canvas. `captureStream` gives video and nothing
 * else, so every exported clip came back silent whatever the source had —
 * measured: one audio track in, none out. That is not "no audio editing", it is
 * losing the soundtrack without saying so.
 *
 * The sample carries a steady tone, so how loud the result is comes back as a
 * number rather than as a judgement.
 */
test("the clip keeps its sound, at the level the export was asked for", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  await openVideoPage(page);

  const measured = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 2, withSound: true });

    const loudnessOf = async (blob: Blob): Promise<number> => {
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        const samples = decoded.getChannelData(0);
        // The middle half, so whatever happens at either end does not dominate.
        const from = Math.floor(samples.length * 0.25);
        const to = Math.floor(samples.length * 0.75);
        let sum = 0;
        for (let i = from; i < to; i += 1) sum += samples[i]! * samples[i]!;
        return Math.sqrt(sum / (to - from));
      } finally {
        await context.close();
      }
    };

    const tracksOf = async (blob: Blob): Promise<number> => {
      const probe = document.createElement("video");
      probe.muted = true;
      probe.playsInline = true;
      probe.src = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        probe.onloadeddata = resolve;
        probe.onerror = reject;
        setTimeout(reject, 8000);
      });
      return (probe as unknown as { captureStream(): MediaStream }).captureStream().getAudioTracks().length;
    };

    const exportWith = async (options: Record<string, unknown>) => {
      const source = await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "tone.webm" });
      const written = await window.pixenVideoDemo.exportClip(
        element.editor.document,
        source.element,
        element.editor.resources,
        options,
      );
      return { hasSound: written.hasSound, type: written.type, blob: written.blob };
    };

    const source = await loudnessOf(clip);
    const kept = await exportWith({});
    const quiet = await exportWith({ volume: 0.25 });
    const off = await exportWith({ volume: 0 });

    return {
      source,
      kept: { ...kept, loudness: await loudnessOf(kept.blob), tracks: await tracksOf(kept.blob) },
      quiet: { ...quiet, loudness: await loudnessOf(quiet.blob) },
      off: { ...off, tracks: await tracksOf(off.blob) },
    };
  });

  // Kept by default, and kept as it was: no gain stage, so no resampling.
  expect(measured.kept.hasSound).toBe(true);
  expect(measured.kept.tracks).toBe(1);
  expect(measured.kept.loudness / measured.source).toBeCloseTo(1, 1);

  // A quarter of the level is a quarter of the level.
  expect(measured.quiet.hasSound).toBe(true);
  expect(measured.quiet.loudness / measured.source).toBeCloseTo(0.25, 1);

  // Zero leaves the track out rather than writing silence into it, and the
  // container stops claiming an audio codec it has nothing to put in.
  expect(measured.off.hasSound).toBe(false);
  expect(measured.off.tracks).toBe(0);
  expect(measured.off.type).not.toContain("opus");
});

/**
 * A host that accepts clips usually has a rule about how long one may be — an
 * advert slot, an upload limit. The rule is on the *kept* length rather than on
 * what may be loaded: the source opens as it always did, and the handles stop.
 */
test("a length rule stops the handle that is being dragged", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  // A one-second ceiling against the three-second sample.
  await page.goto("/video.html?clip=..1");
  await page.waitForFunction(() => Boolean(window.pixenVideoDemo));
  await page.waitForFunction(() => Boolean((document.querySelector("#editor") as { editor?: unknown })?.editor));

  await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 3 });
    await window.pixenVideoDemo.openVideo(element.editor, clip, { name: "sample.webm" });
  });

  const editor = page.locator("#editor");
  const before = await page.evaluate(() => {
    const element = document.querySelector("#editor") as VideoEditor;
    const readout = element.shadowRoot?.querySelector(".pixen-trim-readout")?.textContent ?? "";
    return {
      clip: (element.editor.document.clip as { start: number; end: number }[] | null)?.[0] ?? null,
      duration: element.editor.document.source.duration as number,
      readout,
    };
  });

  // Drag the end handle as far right as it goes. It starts a third of the way
  // across, because the rule has already held the clip to one of three seconds.
  const box = (await editor.locator('input[data-handle="end"]').boundingBox())!;
  const middle = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 3, middle);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, middle, { steps: 10 });
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const element = document.querySelector("#editor") as VideoEditor;
    return (element.editor.document.clip as { start: number; end: number }[])[0]!;
  });

  // Nothing is trimmed yet, and the source is three seconds — but the rule says
  // one, so the strip shows one rather than disagreeing with itself before
  // anyone has touched it.
  expect(before.duration).toBeGreaterThan(2);
  expect(before.clip).toBeNull();
  expect(before.readout).toContain("0.0s – 1.0s");

  // And dragging the end handle to the far right does not lengthen it.
  expect(after.end - after.start).toBeLessThanOrEqual(1.001);
  expect(after.start).toBeCloseTo(0, 3);

  // The start handle is where a ceiling could go wrong quietly. `clampClip`
  // takes time off the *end* when a clip is too long, so a start dragged
  // leftwards would haul the far end back with it — a part of the clip nobody
  // had hold of. Put the clip at the end of the source and drag the start out.
  await page.evaluate(() => {
    const element = document.querySelector("#editor") as VideoEditor;
    const duration = element.editor.document.source.duration as number;
    element.editor.dispatch({
      kind: "set-clip",
      range: { start: duration - 1, end: duration },
      bounds: { max: 1 },
    });
  });

  // Driven through the control's own event rather than the pointer: the mouse
  // path is covered by the trim-strip test next door, and what is under test
  // here is what the handle *means*, at a value a drag cannot land on exactly.
  const dragged = await page.evaluate(() => {
    const element = document.querySelector("#editor") as VideoEditor;
    const handle = element.shadowRoot!.querySelector('input[data-handle="start"]') as HTMLInputElement;
    handle.value = "0";
    handle.dispatchEvent(new Event("input", { bubbles: true }));
    handle.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      clip: (element.editor.document.clip as { start: number; end: number }[])[0]!,
      duration: element.editor.document.source.duration as number,
    };
  });

  // The end stayed where it was, and the clip is still within the rule.
  expect(dragged.clip.end).toBeCloseTo(dragged.duration, 2);
  expect(dragged.clip.end - dragged.clip.start).toBeLessThanOrEqual(1.001);
});

/**
 * One kept range was the whole of trimming until it was not: a talk with two
 * good answers in it, an interview with the pauses taken out. What is stored is
 * what is *kept*, and the export runs each part into one recording — the seek
 * between them costs a moment of wall clock and nothing in the file, because
 * the recorder is sampling a canvas and the canvas simply goes on showing the
 * last frame until the next part arrives.
 *
 * The sample is a red second, a green second and a blue second, so "the green
 * one is gone" is a one-pixel read rather than a judgement.
 */
test("two kept parts export as one file with the part between them missing", async ({ page }) => {
  test.setTimeout(REALTIME_BUDGET_MS);
  await openVideoPage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as VideoEditor;
    const clip = await window.pixenVideoDemo.recordSampleClip({ seconds: 3 });
    const source = await window.pixenVideoDemo.openVideo(element.editor, clip);

    // The red second and the blue one, inset so a frame either side of a
    // boundary cannot drift into the answer. The green one is left out.
    element.editor.dispatch({
      kind: "set-clip",
      range: [
        { start: 0.2, end: 0.8 },
        { start: 2.2, end: 2.8 },
      ],
    });

    const written = await window.pixenVideoDemo.exportClip(
      element.editor.document,
      source.element,
      element.editor.resources,
    );

    const played = document.createElement("video");
    played.muted = true;
    played.playsInline = true;
    played.src = URL.createObjectURL(written.blob);
    await new Promise((resolve) => {
      played.onloadeddata = resolve;
      played.onerror = resolve;
      setTimeout(resolve, 8000);
    });

    const read = document.createElement("canvas");
    read.width = written.width;
    read.height = written.height;
    const context = read.getContext("2d")!;
    const sampleAt = async (fraction: number) => {
      played.currentTime = (played.duration || 1.2) * fraction;
      await new Promise((resolve) => {
        played.onseeked = resolve;
        setTimeout(resolve, 2000);
      });
      context.drawImage(played, 0, 0, written.width, written.height);
      // A quarter in from the corner: the middle carries the burnt-in clock.
      const data = context.getImageData(Math.round(written.width / 4), Math.round(written.height / 4), 1, 1).data;
      return { r: data[0]!, g: data[1]!, b: data[2]! };
    };

    return {
      reportedDuration: written.duration,
      exportedDuration: played.duration,
      early: await sampleAt(0.2),
      late: await sampleAt(0.8),
      storedParts: (element.editor.document.clip as unknown[]).length,
    };
  });

  expect(outcome.storedParts).toBe(2);

  // Two six-tenths of a second, so the file is about 1.2s — not the 2.6s that
  // the outer edges of the two parts span.
  expect(outcome.reportedDuration).toBeCloseTo(1.2, 1);
  expect(outcome.exportedDuration).toBeGreaterThan(0.9);
  expect(outcome.exportedDuration).toBeLessThan(1.8);

  // Red at the front, blue at the back, and the green second nowhere at all.
  expect(outcome.early.r).toBeGreaterThan(outcome.early.b);
  expect(outcome.late.b).toBeGreaterThan(outcome.late.r);
  expect(outcome.early.g).toBeLessThan(outcome.early.r);
  expect(outcome.late.g).toBeLessThan(outcome.late.b);
});
