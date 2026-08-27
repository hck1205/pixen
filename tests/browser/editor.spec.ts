import { expect, test, type Page } from "@playwright/test";

/**
 * These run against the built playground — the same bundle a customer would
 * integrate. Unit tests cover the maths; this suite covers what only a real
 * engine can answer: canvas output, pointer gestures, and encoders.
 */

type EditorElement = HTMLElement & {
  tool: string;
  editor: {
    ready: boolean;
    document: { transform: { rotation: number }; layers: unknown[]; crop: unknown; source: { width: number } };
    cropRect: { x: number; y: number; width: number; height: number };
    stageSize: { width: number; height: number };
    outputSize: { width: number; height: number };
    historyState: { canUndo: boolean; canRedo: boolean; depth: number };
    setAspectRatio(ratio: number | null): void;
    rotateRight(): void;
    exportTo(target: Record<string, unknown>, options?: Record<string, unknown>): Promise<{
      status: number;
      body: string;
    }>;
    renderToCanvas(options?: Record<string, unknown>): { canvas: HTMLCanvasElement };
    renderToImageData(options?: Record<string, unknown>): ImageData;
    renderMask(options?: Record<string, unknown>): { canvas: HTMLCanvasElement };
  };
  viewport: { stageToScreen(point: { x: number; y: number }): { x: number; y: number } } | null;
  export(options?: Record<string, unknown>): Promise<{
    blob: Blob;
    width: number;
    height: number;
    bytes: number;
    format: string;
    quality: number;
    filename: string;
  }>;
};

/**
 * Waits for the view to stop moving.
 *
 * The viewport fits itself from a `ResizeObserver`, so anything that changes
 * the space around the canvas — a picture arriving, a style bar growing a row
 * because a caption is now selected — re-fits it a frame or two later. A test
 * that reads a stage point, converts it and hands the result to the mouse lands
 * one round trip after reading, and if the view moved in between it clicks
 * somewhere else. That was one failure in three in the test that clicks
 * furthest from a layer's origin, where the drift is largest.
 *
 * Two consecutive frames agreeing is the view having settled.
 */
async function settleView(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const viewport = (document.querySelector("pixen-image-editor") as EditorElement).viewport;
    if (!viewport) return false;
    const read = (): string =>
      JSON.stringify([viewport.stageToScreen({ x: 0, y: 0 }), viewport.stageToScreen({ x: 1000, y: 1000 })]);
    return new Promise<boolean>((resolve) => {
      const before = read();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(read() === before)));
    });
  });
}

async function waitForImage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement | null;
    return Boolean(element?.editor?.ready);
  });
  await settleView(page);
}

async function state(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    return {
      document: element.editor.document,
      crop: element.editor.cropRect,
      output: element.editor.outputSize,
      history: element.editor.historyState,
    };
  });
}

/** Converts a stage-space point to page coordinates via the element's own mapping. */
async function stageToClient(page: Page, point: { x: number; y: number }) {
  return page.evaluate((stagePoint) => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const canvas = element.shadowRoot!.querySelector("canvas")!;
    const bounds = canvas.getBoundingClientRect();
    const screen = element.viewport!.stageToScreen(stagePoint);
    return { x: bounds.left + screen.x, y: bounds.top + screen.y };
  }, point);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);
});

test("decodes the sample and paints it to the canvas", async ({ page }) => {
  expect((await state(page)).output).toEqual({ width: 1600, height: 1067 });

  const opaquePixels = await page.evaluate(() => {
    const canvas = document.querySelector("pixen-image-editor")!.shadowRoot!.querySelector("canvas")!;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i]! > 0) opaque += 1;
    return opaque;
  });
  expect(opaquePixels).toBeGreaterThan(0);
});

test("a crop drag is a single undo step", async ({ page }) => {
  const before = await state(page);
  const corner = await stageToClient(page, {
    x: before.crop.x + before.crop.width,
    y: before.crop.y + before.crop.height,
  });
  const target = await stageToClient(page, {
    x: before.crop.x + before.crop.width * 0.6,
    y: before.crop.y + before.crop.height * 0.6,
  });

  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();

  const after = await state(page);
  expect(after.crop.width).toBeLessThan(before.crop.width * 0.8);
  expect(after.history.depth).toBe(1);

  await page.keyboard.press("ControlOrMeta+z");
  expect((await state(page)).document.crop).toBeNull();
});

test("panning the crop keeps it inside the stage", async ({ page }) => {
  await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    element.editor.setAspectRatio(1);
  });

  const before = await state(page);
  const centre = await stageToClient(page, {
    x: before.crop.x + before.crop.width / 2,
    y: before.crop.y + before.crop.height / 2,
  });

  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - 4000, centre.y, { steps: 10 });
  await page.mouse.up();

  const after = await state(page);
  expect(after.crop.x).toBeGreaterThanOrEqual(-0.001);
  expect(after.crop.width / after.crop.height).toBeCloseTo(1, 4);
});

test("rotating keeps a locked square export square", async ({ page }) => {
  await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    element.editor.setAspectRatio(1);
    element.editor.rotateRight();
  });

  const after = await state(page);
  expect(after.output.width).toBe(after.output.height);
  expect(after.document.transform.rotation).toBeCloseTo(Math.PI / 2, 5);
});

test("exports WebP at a requested size and byte budget", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const exported = await element.export({ format: "image/webp", width: 640, maxBytes: 60_000 });
    return {
      width: exported.width,
      height: exported.height,
      bytes: exported.bytes,
      format: exported.format,
      quality: exported.quality,
    };
  });

  expect(result.format).toBe("image/webp");
  expect(result.width).toBe(640);
  expect(result.height).toBe(427);
  expect(result.bytes).toBeLessThanOrEqual(60_000);
});

test("a redaction covers the pixels it was drawn over in the exported file", async ({ page }) => {
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).tool = "redact";
  });

  const stage = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    return element.editor.stageSize;
  });
  const from = await stageToClient(page, { x: stage.width * 0.3, y: stage.height * 0.3 });
  const to = await stageToClient(page, { x: stage.width * 0.7, y: stage.height * 0.7 });

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  expect((await state(page)).document.layers).toHaveLength(1);

  const pixel = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const result = await element.export({ format: "image/png", width: 200 });
    const bitmap = await createImageBitmap(result.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const centre = context.getImageData(Math.round(bitmap.width / 2), Math.round(bitmap.height / 2), 1, 1).data;
    const corner = context.getImageData(2, 2, 1, 1).data;
    return {
      width: result.width,
      centre: [centre[0]!, centre[1]!, centre[2]!],
      corner: [corner[0]!, corner[1]!, corner[2]!],
    };
  });

  expect(pixel.width).toBe(200);
  // The mask is #101114: the covered pixels are gone from the exported file,
  // not merely hidden behind an overlay.
  expect(Math.max(...pixel.centre)).toBeLessThan(40);
  expect(Math.max(...pixel.corner)).toBeGreaterThan(40);
});

test("blur and pixelate redactions really change the exported pixels", async ({ page }) => {
  const measure = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: {
        document: { source: { width: number; height: number } };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
        removeLayer(id: string): void;
      };
      export(options?: Record<string, unknown>): Promise<{ blob: Blob }>;
    };

    /**
     * Local contrast: the mean step between horizontally adjacent pixels.
     *
     * Variance would be dominated by the sky gradient, which a blur does not
     * touch. Detail lives in the steps between neighbours, and that is exactly
     * what blurring and pixelating destroy.
     */
    const detailOf = async (blob: Blob, region: { x: number; y: number; w: number; h: number }) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(
        Math.round(bitmap.width * region.x),
        Math.round(bitmap.height * region.y),
        Math.round(bitmap.width * region.w),
        Math.round(bitmap.height * region.h),
      );

      const width = Math.round(bitmap.width * region.w);
      const height = Math.round(bitmap.height * region.h);
      const luma = (index: number) =>
        0.213 * data[index]! + 0.715 * data[index + 1]! + 0.072 * data[index + 2]!;

      let total = 0;
      let count = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width - 1; x += 1) {
          const index = (y * width + x) * 4;
          total += Math.abs(luma(index + 4) - luma(index));
          count += 1;
        }
      }
      return count === 0 ? 0 : total / count;
    };

    // The sample prints identifiers across the upper-left; that is the detail
    // a redaction has to destroy.
    const region = { x: 0.06, y: 0.12, w: 0.34, h: 0.2 };
    const { width, height } = element.editor.document.source;
    const frame = {
      x: width * region.x,
      y: height * region.y,
      width: width * region.w,
      height: height * region.h,
    };

    const plain = await detailOf((await element.export({ format: "image/png" })).blob, region);

    const results: Record<string, number> = {};
    for (const mode of ["blur", "pixelate", "scramble", "solid"] as const) {
      const layer = { ...makeRedaction(frame), mode };
      element.editor.addLayer(layer, { select: false });
      results[mode] = await detailOf((await element.export({ format: "image/png" })).blob, region);
      element.editor.removeLayer(layer.id);
    }

    function makeRedaction(box: typeof frame) {
      return {
        id: `redact_${Math.random().toString(36).slice(2)}`,
        type: "redact" as const,
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        frame: box,
        mode: "solid" as const,
        strength: 0.03,
        colour: "#12161c",
      };
    }

    return { plain, ...results };
  });

  // The region starts with real detail: the identifiers printed on the sample.
  expect(measure.plain).toBeGreaterThan(1);
  // Every mode has to destroy it.
  expect(measure.blur).toBeLessThan(measure.plain / 3);
  expect(measure.pixelate).toBeLessThan(measure.plain / 3);
  expect(measure.scramble).toBeLessThan(measure.plain / 3);
  // A solid fill leaves nothing at all.
  expect(measure.solid).toBeLessThan(0.05);
});

/** Image-space point -> page coordinates, through the element's own mapping. */
async function imageToClient(page: Page, point: { x: number; y: number }) {
  return page.evaluate((imagePoint) => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: { document: { source: { width: number; height: number } } };
    };
    const canvas = element.shadowRoot!.querySelector("canvas")!;
    const bounds = canvas.getBoundingClientRect();
    // With no rotation or flip the stage is the image, so the two spaces agree.
    const screen = element.viewport!.stageToScreen(imagePoint);
    return { x: bounds.left + screen.x, y: bounds.top + screen.y };
  }, point);
}

/** Adds a rect layer, selects it, and returns its id and frame. */
async function seedSelectedRect(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      tool: string;
      editor: {
        document: { source: { width: number; height: number }; layers: Array<{ id: string }> };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
        select(id: string): void;
      };
    };
    const { width, height } = element.editor.document.source;
    const frame = { x: width * 0.2, y: height * 0.2, width: width * 0.3, height: height * 0.3 };
    const layer = {
      id: "rect_under_test",
      type: "rect" as const,
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      frame,
      stroke: { color: "#ff0000", width: 8 },
      fill: null,
      cornerRadius: 0,
    };
    element.editor.addLayer(layer, { select: false });
    element.editor.select(layer.id);
    element.tool = "select";
    return { id: layer.id, frame };
  });
}

/** The layer under test, as the document now holds it. */
async function layerState(page: Page, id: string) {
  return page.evaluate((layerId) => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const layer = (element.editor.document.layers as Array<Record<string, unknown>>).find(
      (candidate) => candidate.id === layerId,
    );
    return layer as unknown as { frame: { x: number; y: number; width: number; height: number }; rotation: number };
  }, id);
}

test("dragging a corner handle resizes the selected layer in one undo step", async ({ page }) => {
  const seeded = await seedSelectedRect(page);
  const before = await state(page);

  const corner = await imageToClient(page, {
    x: seeded.frame.x + seeded.frame.width,
    y: seeded.frame.y + seeded.frame.height,
  });
  const target = await imageToClient(page, {
    x: seeded.frame.x + seeded.frame.width * 1.5,
    y: seeded.frame.y + seeded.frame.height * 1.5,
  });

  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();

  const after = await layerState(page, seeded.id);
  expect(after.frame.width).toBeGreaterThan(seeded.frame.width * 1.3);
  // The opposite corner is pinned, so the layer grew rather than moved.
  expect(after.frame.x).toBeCloseTo(seeded.frame.x, 0);
  expect(after.frame.y).toBeCloseTo(seeded.frame.y, 0);
  // A whole drag is one step, however many pointer moves it took.
  expect((await state(page)).history.depth).toBe(before.history.depth + 1);

  await page.keyboard.press("ControlOrMeta+z");
  expect((await layerState(page, seeded.id)).frame.width).toBeCloseTo(seeded.frame.width, 0);
});

test("dragging the rotate grip turns the selected layer", async ({ page }) => {
  const seeded = await seedSelectedRect(page);

  const grip = await page.evaluate((layerId) => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const layer = (element.editor.document.layers as Array<{ id: string }>).find(
      (candidate) => candidate.id === layerId,
    )!;
    // The page bundles the engine, so the handle geometry comes from it rather
    // than being re-derived here and allowed to drift.
    return (window as unknown as { pixen: { layerHandlePosition(l: unknown, h: string): { x: number; y: number } } })
      .pixen.layerHandlePosition(layer, "rotate");
  }, seeded.id);

  const from = await imageToClient(page, grip);
  const centre = {
    x: seeded.frame.x + seeded.frame.width / 2,
    y: seeded.frame.y + seeded.frame.height / 2,
  };
  // A quarter turn: grab the grip above the layer and carry it to the right.
  const to = await imageToClient(page, { x: centre.x + seeded.frame.width, y: centre.y });

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  expect((await layerState(page, seeded.id)).rotation).toBeCloseTo(Math.PI / 2, 1);
});

test("a watermark reaches both the preview canvas and the exported file", async ({ page }) => {
  const measure = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: {
        document: { source: { width: number; height: number } };
        resources: { load(input: Blob): Promise<{ id: string }> };
        addWatermark(options: Record<string, unknown>): void;
      };
      shadowRoot: ShadowRoot;
      export(options?: Record<string, unknown>): Promise<{ blob: Blob }>;
    };

    /** A flat red square, so the watermark is unmistakable in a sampled pixel. */
    const MARK_SIZE = { width: 64, height: 64 };
    const mark = new OffscreenCanvas(MARK_SIZE.width, MARK_SIZE.height);
    const markContext = mark.getContext("2d")!;
    markContext.fillStyle = "#ff0000";
    markContext.fillRect(0, 0, MARK_SIZE.width, MARK_SIZE.height);

    /** The colour at a fraction of the way across an exported image. */
    const sample = async (blob: Blob, at: { x: number; y: number }) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(
        Math.round(bitmap.width * at.x),
        Math.round(bitmap.height * at.y),
        1,
        1,
      );
      return [data[0]!, data[1]!, data[2]!] as [number, number, number];
    };

    // Where a square mark at 30% of the longest edge, inset by the default 3%
    // margin, puts its own centre in the bottom-right corner.
    const { width, height } = element.editor.document.source;
    const longest = Math.max(width, height);
    const scale = 0.3;
    const margin = 0.03;
    const centre = {
      x: (width - longest * (margin + scale / 2)) / width,
      y: (height - longest * (margin + scale / 2)) / height,
    };

    const before = await sample((await element.export({ format: "image/png" })).blob, centre);

    const resource = await element.editor.resources.load(await mark.convertToBlob({ type: "image/png" }));
    element.editor.addWatermark({ resourceId: resource.id, size: MARK_SIZE, scale, opacity: 1 });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const after = await sample((await element.export({ format: "image/png" })).blob, centre);

    // The preview is a separate render path from the export, and image layers
    // were once missing from both; assert the on-screen canvas too.
    const canvas = element.shadowRoot.querySelector("canvas")!;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let previewRed = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 200 && data[i + 1]! < 80 && data[i + 2]! < 80) previewRed += 1;
    }

    return { before, after, previewRed };
  });

  expect(measure.before[0] - measure.before[2]).toBeLessThan(100);
  expect(measure.after[0]).toBeGreaterThan(200);
  expect(measure.after[1]).toBeLessThan(80);
  expect(measure.previewRed).toBeGreaterThan(100);
});

test("the chrome stays inside the host at any size", async ({ page }) => {
  const measure = async (width: number, height: number) =>
    page.evaluate(
      async ([w, h]) => {
        const element = document.querySelector("pixen-image-editor") as HTMLElement;
        const frame = element.parentElement as HTMLElement;
        frame.style.width = `${w}px`;
        frame.style.height = `${h}px`;
        // Two frames: one for layout, one for the editor's resize handling.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const host = element.getBoundingClientRect();
        const shadow = element.shadowRoot!;
        const inside = (node: Element) => {
          const box = node.getBoundingClientRect();
          return (
            box.left >= host.left - 1 &&
            box.right <= host.right + 1 &&
            box.top >= host.top - 1 &&
            box.bottom <= host.bottom + 1
          );
        };
        const canvas = shadow.querySelector("canvas") as HTMLCanvasElement;
        return {
          host: { width: Math.round(host.width), height: Math.round(host.height) },
          canvas: {
            width: Math.round(canvas.getBoundingClientRect().width),
            height: Math.round(canvas.getBoundingClientRect().height),
          },
          railInside: inside(shadow.querySelector(".rail")!),
          inspectorInside: inside(shadow.querySelector(".inspector")!),
          actionsInside: inside(shadow.querySelector(".actions")!),
        };
      },
      [width, height],
    );

  // A canvas carries an intrinsic size from its width/height attributes. If it
  // is left in flow it grows its own container, the fit zoom is computed
  // against the wrong height, and the bottom of the chrome is clipped away.
  for (const [width, height] of [
    [1200, 700],
    [1400, 380],
    [360, 320],
  ] as const) {
    const layout = await measure(width, height);
    expect(layout.canvas, `${width}x${height} canvas matches the host`).toEqual(layout.host);
    expect(layout.railInside, `${width}x${height} rail inside`).toBe(true);
    expect(layout.inspectorInside, `${width}x${height} inspector inside`).toBe(true);
    expect(layout.actionsInside, `${width}x${height} actions inside`).toBe(true);
  }
});

test("fitting keeps the whole image clear of the floating chrome", async ({ page }) => {
  const clear = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: { stageSize: { width: number; height: number } };
      viewport: { stageToScreen(p: { x: number; y: number }): { x: number; y: number } } | null;
      zoomToFit(): void;
    };
    element.zoomToFit();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const stage = element.editor.stageSize;
    const topLeft = element.viewport!.stageToScreen({ x: 0, y: 0 });
    const bottomRight = element.viewport!.stageToScreen({ x: stage.width, y: stage.height });
    const shadow = element.shadowRoot!;
    const canvas = shadow.querySelector("canvas")!.getBoundingClientRect();
    const inspector = shadow.querySelector(".inspector")!.getBoundingClientRect();

    return {
      // stageToScreen is relative to the canvas, so compare in the same space.
      imageBottom: bottomRight.y,
      inspectorTop: inspector.top - canvas.top,
      imageTop: topLeft.y,
    };
  });

  expect(clear.imageTop).toBeGreaterThan(0);
  expect(clear.imageBottom).toBeLessThanOrEqual(clear.inspectorTop + 1);
});

test("the image stays clear of the chrome with the adjust panel open", async ({ page }) => {
  // The adjust panel is the tallest one — a slider per adjustment and a button
  // per preset — and it is the one that would push the inspector over the image
  // if the fit ignored how tall the chrome actually is.
  const clear = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: { stageSize: { width: number; height: number } };
      viewport: { stageToScreen(p: { x: number; y: number }): { x: number; y: number } } | null;
      zoomToFit(): void;
    };
    const shadow = element.shadowRoot!;
    const adjust = shadow.querySelector<HTMLButtonElement>('button[data-panel="adjust"]')!;
    adjust.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    element.zoomToFit();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const stage = element.editor.stageSize;
    const bottomRight = element.viewport!.stageToScreen({ x: stage.width, y: stage.height });
    const canvas = shadow.querySelector("canvas")!.getBoundingClientRect();
    const inspector = shadow.querySelector(".inspector")!.getBoundingClientRect();
    const host = element.getBoundingClientRect();

    return {
      imageTop: element.viewport!.stageToScreen({ x: 0, y: 0 }).y,
      imageBottom: bottomRight.y,
      inspectorTop: inspector.top - canvas.top,
      // The panel must stay inside the host however many rows it wrapped to.
      inspectorOverflow: inspector.bottom - host.bottom,
      sliders: shadow.querySelectorAll('.inspector input[type="range"]').length,
      // Read from the panel rather than restated here: an adjustment added to
      // the engine adds a slider, and this test should not be the thing that
      // has to be edited for it.
      expected: shadow.querySelectorAll(".inspector .field").length,
    };
  });

  // Every adjustment is reachable rather than squashed off the end of a row.
  expect(clear.sliders).toBeGreaterThan(9);
  expect(clear.sliders).toBe(clear.expected);
  expect(clear.inspectorOverflow).toBeLessThanOrEqual(1);
  expect(clear.imageTop).toBeGreaterThan(0);
  expect(clear.imageBottom).toBeLessThanOrEqual(clear.inspectorTop + 1);
});

test("straightening leaves no blank corners in the exported file", async ({ page }) => {
  const measure = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: { straighten(radians: number): void; straightenAngle: number };
      export(options?: Record<string, unknown>): Promise<{ blob: Blob }>;
    };

    /** How many sampled pixels are transparent — a blank corner would be. */
    const transparentCorners = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      // Cleared, not filled: anything the render did not cover stays transparent.
      context.clearRect(0, 0, bitmap.width, bitmap.height);
      context.drawImage(bitmap, 0, 0);

      const inset = 2;
      const points = [
        [inset, inset],
        [bitmap.width - inset, inset],
        [inset, bitmap.height - inset],
        [bitmap.width - inset, bitmap.height - inset],
      ] as const;
      return points.filter(([x, y]) => context.getImageData(x, y, 1, 1).data[3]! < 250).length;
    };

    const results: Record<string, number> = {};
    for (const degrees of [0, 3, 12, 30, -20]) {
      element.editor.straighten((degrees * Math.PI) / 180);
      results[`d${degrees}`] = await transparentCorners(
        (await element.export({ format: "image/png" })).blob,
      );
    }

    element.editor.straighten(0);
    return { ...results, angleAfterReset: element.editor.straightenAngle };
  });

  // Every angle exports a full frame of image, corners included.
  expect(measure.d0).toBe(0);
  expect(measure.d3).toBe(0);
  expect(measure.d12).toBe(0);
  expect(measure.d30).toBe(0);
  expect(measure["d-20"]).toBe(0);
  expect(measure.angleAfterReset).toBeCloseTo(0);
});

test("the straighten slider drives the document and undoes as one step", async ({ page }) => {
  const before = await state(page);

  const angle = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: { straightenAngle: number };
    };
    const slider = element.shadowRoot!.querySelector<HTMLInputElement>('input[data-field="straighten"]')!;
    slider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    slider.value = "8";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.value = "10";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return element.editor.straightenAngle;
  });

  expect((angle * 180) / Math.PI).toBeCloseTo(10, 1);
  expect((await state(page)).history.depth).toBe(before.history.depth + 1);

  // The shortcut is handled by the element, so it has to be the focused thing.
  await page.evaluate(() => (document.querySelector("pixen-image-editor") as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+z");
  const undone = await page.evaluate(
    () => (document.querySelector("pixen-image-editor") as EditorElement & { editor: { straightenAngle: number } }).editor.straightenAngle,
  );
  expect(undone).toBeCloseTo(0);
});

test("a taller panel re-fits the image instead of hiding it", async ({ page }) => {
  // The adjust panel wraps onto several rows on a phone-sized host; the fit has
  // to follow the chrome that is actually there, not the one that was there
  // when the image loaded.
  const measure = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: { stageSize: { width: number; height: number } };
      viewport: { stageToScreen(p: { x: number; y: number }): { x: number; y: number } } | null;
    };
    const frame = element.parentElement as HTMLElement;
    frame.style.width = "420px";
    frame.style.height = "620px";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const shadow = element.shadowRoot!;
    const settle = async () => {
      for (let i = 0; i < 4; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    await settle();

    const bottomOf = () => {
      const stage = element.editor.stageSize;
      return element.viewport!.stageToScreen({ x: stage.width, y: stage.height }).y;
    };
    const inspectorTop = () => {
      const canvas = shadow.querySelector("canvas")!.getBoundingClientRect();
      return shadow.querySelector(".inspector")!.getBoundingClientRect().top - canvas.top;
    };

    const beforePanel = { image: bottomOf(), inspector: inspectorTop() };
    shadow.querySelector<HTMLButtonElement>('button[data-panel="adjust"]')!.click();
    await settle();
    const afterPanel = { image: bottomOf(), inspector: inspectorTop() };

    return { beforePanel, afterPanel };
  });

  // The tall panel really is taller, and the image moved out of its way.
  expect(measure.afterPanel.inspector).toBeLessThan(measure.beforePanel.inspector);
  expect(measure.afterPanel.image).toBeLessThanOrEqual(measure.afterPanel.inspector + 1);
});

test("text is typed on the canvas, where it appears", async ({ page }) => {
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).tool = "text";
  });

  const stage = await page.evaluate(
    () => (document.querySelector("pixen-image-editor") as EditorElement).editor.stageSize,
  );
  const at = await stageToClient(page, { x: stage.width * 0.25, y: stage.height * 0.35 });
  await page.mouse.click(at.x, at.y);

  // Clicking with the text tool creates a layer and opens its editor on the
  // canvas, so the very next keystroke is the text.
  const editor = page.locator("pixen-image-editor").locator("textarea.text-input");
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();

  await page.keyboard.type("hello");
  const whileEditing = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const layer = element.editor.document.layers[0] as unknown as { text: string; visible: boolean };
    return { text: layer.text, visible: layer.visible };
  });
  expect(whileEditing.text).toBe("hello");
  // Exactly one copy of the text on screen: the layer is hidden behind its editor.
  expect(whileEditing.visible).toBe(false);

  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();

  const after = await state(page);
  expect(after.document.layers).toHaveLength(1);
  expect((after.document.layers[0] as { text: string; visible: boolean }).visible).toBe(true);
  // The whole edit is one step, however many keystrokes it took.
  expect(after.history.depth).toBe(1);
});

test("an empty text layer is dropped rather than left as litter", async ({ page }) => {
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).tool = "text";
  });
  const stage = await page.evaluate(
    () => (document.querySelector("pixen-image-editor") as EditorElement).editor.stageSize,
  );
  const at = await stageToClient(page, { x: stage.width * 0.4, y: stage.height * 0.4 });
  await page.mouse.click(at.x, at.y);
  await page.locator("pixen-image-editor").locator("textarea.text-input").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");

  const after = await state(page);
  expect(after.document.layers).toHaveLength(0);
  expect(after.history.depth).toBe(0);
});

test("double-clicking existing text reopens it for editing", async ({ page }) => {
  const seeded = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        document: { source: { width: number; height: number } };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
      };
      tool: string;
    };
    const { width, height } = element.editor.document.source;
    const layer = {
      id: "text_under_test",
      type: "text" as const,
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      position: { x: width * 0.2, y: height * 0.3 },
      text: "edit me",
      fontSize: Math.round(height * 0.08),
      fontFamily: "system-ui, sans-serif",
      color: "#ffffff",
      align: "left" as const,
      backgroundColor: null,
      maxWidth: null,
    };
    element.editor.addLayer(layer, { select: false });
    element.tool = "select";
    return { position: layer.position, fontSize: layer.fontSize };
  });

  const at = await imageToClient(page, {
    x: seeded.position.x + seeded.fontSize,
    y: seeded.position.y + seeded.fontSize / 2,
  });
  await page.mouse.dblclick(at.x, at.y);

  const editor = page.locator("pixen-image-editor").locator("textarea.text-input");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("edit me");
});

/**
 * The same artwork placed twice is decoded once and referenced by id.
 *
 * That is the claim on the coverage page, and it is what makes a document with
 * ten stickers small JSON rather than ten bitmaps. Nothing had ever placed one
 * twice — the existing test places a single sticker and checks where it lands.
 */
test("placing the same sticker twice decodes it once and shares the bitmap", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      stickers: unknown;
      editor: { resources: { stats(): { count: number } } };
    };

    const mark = new OffscreenCanvas(40, 20);
    const context = mark.getContext("2d")!;
    context.fillStyle = "#00cc66";
    context.fillRect(0, 0, 40, 20);
    element.stickers = [{ id: "green", src: await mark.convertToBlob({ type: "image/png" }), label: "Green" }];
    element.tool = "sticker";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const shadow = element.shadowRoot!;
    const offer = () =>
      [...shadow.querySelectorAll<HTMLButtonElement>(".inspector button")].find((candidate) =>
        candidate.textContent?.includes("Green"),
      );

    const before = element.editor.resources.stats().count;
    offer()?.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterFirst = element.editor.resources.stats().count;

    // Back to the sticker tool for a second placement of the *same* artwork.
    element.tool = "sticker";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    offer()?.click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const layers = element.editor.document.layers.filter((layer) => layer.type === "image") as Array<{
      resourceId: string;
      frame: { width: number };
    }>;
    return {
      before,
      afterFirst,
      afterSecond: element.editor.resources.stats().count,
      resourceIds: layers.map((layer) => layer.resourceId),
      widths: layers.map((layer) => layer.frame.width),
    };
  });

  // Two layers, both drawn from one bitmap.
  expect(outcome.resourceIds).toHaveLength(2);
  expect(outcome.resourceIds[0]).toBe(outcome.resourceIds[1]);
  // And the manager holds one more resource than it did, not two.
  expect(outcome.afterFirst).toBe(outcome.before + 1);
  expect(outcome.afterSecond).toBe(outcome.afterFirst);
  // Both are the artwork's own shape, so the second is a placement rather than
  // a differently-sized copy that happens to share an id.
  expect(outcome.widths[0]).toBeCloseTo(outcome.widths[1]!, 5);
});

test("a sticker lands in the middle of the crop, selected and ready to resize", async ({ page }) => {
  const placed = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      stickers: unknown;
      tool: string;
      editor: {
        document: { source: { width: number; height: number }; layers: Array<Record<string, unknown>> };
        selectedLayer: { id: string; type: string } | null;
        setCropRect(rect: { x: number; y: number; width: number; height: number } | null): void;
      };
    };

    const mark = new OffscreenCanvas(120, 60);
    const context = mark.getContext("2d")!;
    context.fillStyle = "#00ff00";
    context.fillRect(0, 0, 120, 60);
    element.stickers = [{ id: "green", src: await mark.convertToBlob({ type: "image/png" }), label: "Green" }];

    // Crop to a corner first: a sticker belongs in the middle of what is
    // visible, which after a crop is not the middle of the image.
    const { width, height } = element.editor.document.source;
    const crop = { x: width * 0.5, y: height * 0.5, width: width * 0.4, height: height * 0.4 };
    element.editor.setCropRect(crop);
    element.tool = "sticker";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const shadow = element.shadowRoot!;
    const buttons = [...shadow.querySelectorAll<HTMLButtonElement>(".inspector button")];
    const sticker = buttons.find((candidate) => candidate.textContent?.includes("Green"));
    sticker?.click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const layer = element.editor.document.layers.at(-1) as
      | { type: string; frame: { x: number; y: number; width: number; height: number } }
      | undefined;
    return {
      offered: buttons.length,
      layer,
      crop,
      selected: element.editor.selectedLayer?.id,
      layerId: (layer as unknown as { id: string } | undefined)?.id,
      tool: element.tool,
    };
  });

  expect(placed.offered).toBeGreaterThan(0);
  expect(placed.layer?.type).toBe("image");
  // Centred on the crop, not on the image.
  expect(placed.layer!.frame.x + placed.layer!.frame.width / 2).toBeCloseTo(placed.crop.x + placed.crop.width / 2, 0);
  expect(placed.layer!.frame.y + placed.layer!.frame.height / 2).toBeCloseTo(placed.crop.y + placed.crop.height / 2, 0);
  // Keeps the bitmap's 2:1 shape.
  expect(placed.layer!.frame.width / placed.layer!.frame.height).toBeCloseTo(2, 1);
  // Selected, with the select tool active, so the handles are already on it.
  expect(placed.selected).toBe(placed.layerId);
  expect(placed.tool).toBe("select");
});

test("a right-to-left locale mirrors the chrome without reversing the numbers", async ({ page }) => {
  const measure = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    element.setAttribute("locale", "ar");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const shadow = element.shadowRoot!;
    const host = element.getBoundingClientRect();
    const rail = shadow.querySelector(".rail")!.getBoundingClientRect();
    const readouts = [...shadow.querySelectorAll<HTMLElement>(".inspector .readout")];

    return {
      dir: element.getAttribute("dir"),
      // The rail belongs on the side the reader starts from.
      railIsOnTheRight: rail.left - host.left > host.right - rail.right,
      exportLabel: shadow.querySelector('[part="actions"] button.primary')?.textContent?.trim() ?? "",
      readoutDirs: readouts.map((node) => node.dir),
      readoutTexts: readouts.map((node) => node.textContent?.trim() ?? ""),
    };
  });

  expect(measure.dir).toBe("rtl");
  expect(measure.railIsOnTheRight).toBe(true);
  // The chrome is translated, not just mirrored.
  expect(measure.exportLabel).toContain("تصدير");
  // `1600 × 1067` reordered by the bidi algorithm reads `1067 × 1600` — not a
  // formatting quibble but the wrong number.
  expect(measure.readoutDirs.every((dir) => dir === "ltr")).toBe(true);
  expect(measure.readoutTexts).toContain("1600 × 1067");
});

test("the image worker really runs, and agrees with the main thread", async ({ page }) => {
  const measure = await page.evaluate(async () => {
    const pixen = (window as unknown as { pixen: Record<string, unknown> }).pixen;
    const ImageWorkerClass = pixen.ImageWorker as new () => {
      ready: boolean;
      decode(blob: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number } | null>;
      encode(
        pixels: ArrayBuffer,
        width: number,
        height: number,
        format: string,
        quality: number,
      ): Promise<Blob | null>;
      dispose(): void;
    };
    const available = (pixen.ImageWorker as unknown as { available: boolean }).available;

    // A picture with real detail, so a JPEG of it is not trivially tiny.
    const size = 1200;
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#2040a0");
    gradient.addColorStop(1, "#f0a020");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    for (let i = 0; i < 200; i += 1) {
      context.fillStyle = `hsl(${i * 7}, 80%, ${40 + (i % 30)}%)`;
      context.fillRect((i * 37) % size, (i * 53) % size, 24, 24);
    }
    const source = await canvas.convertToBlob({ type: "image/png" });
    const pixels = context.getImageData(0, 0, size, size);

    const worker = new ImageWorkerClass();
    const decoded = await worker.decode(source);
    const workerBlob = await worker.encode(
      pixels.data.slice().buffer,
      size,
      size,
      "image/jpeg",
      0.8,
    );
    const started = worker.ready;

    // The same encode on the main thread, for comparison.
    const mainBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });

    /** Mean absolute luma difference between two encodings of the same pixels. */
    const difference = async (a: Blob, b: Blob) => {
      const read = async (blob: Blob) => {
        const bitmap = await createImageBitmap(blob);
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = surface.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [left, right] = await Promise.all([read(a), read(b)]);
      let total = 0;
      let count = 0;
      for (let i = 0; i < left.length; i += 4 * 13) {
        total += Math.abs(left[i]! - right[i]!);
        count += 1;
      }
      return count === 0 ? 255 : total / count;
    };

    const result = {
      available,
      started,
      decodedSize: decoded ? [decoded.width, decoded.height] : null,
      workerBytes: workerBlob?.size ?? 0,
      workerType: workerBlob?.type ?? "",
      pixelDifference: workerBlob ? await difference(workerBlob, mainBlob) : 255,
    };
    worker.dispose();
    return result;
  });

  expect(measure.available).toBe(true);
  expect(measure.started).toBe(true);
  expect(measure.decodedSize).toEqual([1200, 1200]);
  expect(measure.workerType).toBe("image/jpeg");
  expect(measure.workerBytes).toBeGreaterThan(1000);
  // Same encoder, same pixels, same settings: the two paths must not disagree
  // about what the picture looks like.
  expect(measure.pixelDifference).toBeLessThan(2);
});

test("a plugin adds a real button and a real inspector control", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      use(plugin: (context: Record<string, any>) => void | (() => void)): unknown;
      editor: { document: { layers: unknown[] } };
    };

    const clicks: string[] = [];
    let hasSelection = false;

    const remove = { action: null as null | (() => void) };
    element.use((context) => {
      remove.action = context.addAction({
        id: "save",
        label: "Save to server",
        text: "Save",
        emphasis: "primary",
        onClick: () => clicks.push("save"),
        disabled: () => clicks.length > 0,
      });
      context.addInspectorSection({
        id: "notes",
        when: () => hasSelection,
        build: () => {
          const node = document.createElement("span");
          node.dataset.pluginSection = "notes";
          node.textContent = "Plugin section";
          return [node];
        },
      });
      return () => clicks.push("torn down");
    });

    await new Promise((resolve) => requestAnimationFrame(resolve));
    const shadow = element.shadowRoot!;
    const find = () => shadow.querySelector<HTMLButtonElement>('button[data-action="plugin:save"]');

    const before = {
      button: find()?.textContent?.trim() ?? "",
      disabled: find()?.disabled ?? true,
      sectionShown: shadow.querySelectorAll("[data-plugin-section]").length,
    };

    find()!.click();

    // The section's `when` is asked on every rebuild, so flipping the condition
    // and forcing a rebuild is enough to make it appear.
    hasSelection = true;
    element.tool = "select";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const after = {
      clicks: [...clicks],
      disabled: find()?.disabled ?? false,
      sectionShown: shadow.querySelectorAll("[data-plugin-section]").length,
    };

    remove.action?.();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const removed = find() === null;

    return { before, after, removed };
  });

  expect(result.before.button).toBe("Save");
  expect(result.before.disabled).toBe(false);
  expect(result.before.sectionShown).toBe(0);

  expect(result.after.clicks).toEqual(["save"]);
  // `disabled` is asked on refresh, so the plugin's own state controls it.
  expect(result.after.disabled).toBe(true);
  expect(result.after.sectionShown).toBe(1);

  expect(result.removed).toBe(true);
});

test("the batch pipeline processes several images with no editor involved", async ({ page }) => {
  await page.locator("#batch-sample").click();

  const results = page.locator("#batch-results li");
  await expect(results).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator("#batch-progress")).toHaveText("3 / 3");

  // Every one produced a downloadable file, named and measured.
  for (let index = 0; index < 3; index += 1) {
    const item = results.nth(index);
    await expect(item).not.toHaveClass(/failed/);
    await expect(item.locator("a")).toHaveAttribute("download", /\.(jpe?g|png|webp)$/);
    await expect(item).toContainText("×");
  }

  const measured = await page.evaluate(() => {
    const first = document.querySelector("#batch-results li")!;
    return first.textContent ?? "";
  });
  // Bounded to 1600 on the long edge by the batch options.
  expect(measured).toContain("1600 × 1067");
});

test("undo and redo survive a rotate, crop and annotate sequence", async ({ page }) => {
  const summary = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        rotateRight(): void;
        setAspectRatio(r: number | null): void;
        undo(): boolean;
        redo(): boolean;
        historyState: { depth: number };
        document: { transform: { rotation: number }; aspectRatio: number | null };
      };
    };
    element.editor.rotateRight();
    element.editor.setAspectRatio(16 / 9);
    element.editor.rotateRight();

    const afterEdits = element.editor.document.aspectRatio;
    element.editor.undo();
    element.editor.undo();
    const afterUndo = {
      rotation: element.editor.document.transform.rotation,
      ratio: element.editor.document.aspectRatio,
    };
    element.editor.redo();
    element.editor.redo();
    return {
      afterEdits,
      afterUndo,
      final: {
        rotation: element.editor.document.transform.rotation,
        ratio: element.editor.document.aspectRatio,
      },
    };
  });

  // A quarter turn inverts a locked ratio, and undo must restore the old one.
  expect(summary.afterEdits).toBeCloseTo(9 / 16, 5);
  expect(summary.afterUndo.ratio).toBeNull();
  expect(summary.afterUndo.rotation).toBeCloseTo(Math.PI / 2, 5);
  expect(summary.final.ratio).toBeCloseTo(9 / 16, 5);
  expect(summary.final.rotation).toBeCloseTo(Math.PI, 5);
});

/**
 * A slider that opens in the wrong place is a slider that lies about the
 * document, and it is invisible to a unit test: the truth is in the browser's
 * own value sanitising, which clamps against whatever bounds the input had at
 * the moment the value was assigned.
 */
test("every inspector slider opens where the document actually is", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const readings = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      panel: string;
      tool: string;
      editor: { document: { output: { quality: number | null; format: string | null } }; export(o?: unknown): Promise<{ quality: number }> };
    };
    const shadow = element.shadowRoot!;
    const field = (name: string) =>
      shadow.querySelector<HTMLInputElement>(`input[data-field="${name}"]`);

    element.panel = "output";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const quality = field("quality");

    element.panel = "tool";
    element.tool = "rect";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const width = field("width");

    // The document leaves the quality unset until somebody sets it, and the
    // slider shows what this format would be encoded at. The export is the only
    // authority on that number, so it is asked rather than recomputed here.
    const exported = await element.editor.export({ width: 8, height: 8 });

    return {
      documentQuality: element.editor.document.output.quality,
      exportedQuality: exported.quality,
      quality: quality ? { value: Number(quality.value), min: Number(quality.min) } : null,
      strokeWidth: width ? { value: Number(width.value), min: Number(width.min) } : null,
    };
  });

  expect(readings.documentQuality).toBeNull();
  // The slider and the file agree: a panel showing a number the exporter would
  // not use is the panel lying about the picture.
  expect(readings.quality?.value).toBeCloseTo(readings.exportedQuality, 5);
  // Not pinned to the floor, which is where a value assigned before its bounds
  // ends up once the browser has snapped it to the default whole-number step.
  expect(readings.quality?.value).toBeGreaterThan(readings.quality!.min);
  expect(readings.strokeWidth?.value).toBeGreaterThan(readings.strokeWidth!.min);
});

/**
 * The rail is the only persistent navigation, so a control that scrolls out of
 * it is a feature nobody can find. Opening the tallest panel is the case that
 * squeezed it.
 */
test("every rail button stays visible with the layer list open", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const visibility = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      panel: string;
      editor: { addLayer(layer: unknown): unknown; document: { source: { width: number; height: number } } };
    };
    element.panel = "layers";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const rail = element.shadowRoot!.querySelector(".rail") as HTMLElement;
    const bounds = rail.getBoundingClientRect();
    const buttons = [...rail.querySelectorAll("button")];
    return {
      total: buttons.length,
      visible: buttons.filter((button) => {
        const box = button.getBoundingClientRect();
        return box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
      }).length,
      panels: buttons.filter((button) => button.dataset.panel).length,
    };
  });

  expect(visibility.panels).toBe(3);
  expect(visibility.visible).toBe(visibility.total);
});

/**
 * Multi-size export is only really answerable in a browser: the plan is pure,
 * but whether four renders and four encodes actually produce four different
 * files at the sizes the plan promised is the engine's business.
 */
test("exporting several sizes produces one file per planned size", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const variants = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: {
        outputSize: { width: number; height: number };
        exportVariants(
          specs: unknown[],
          options?: Record<string, unknown>,
        ): Promise<Array<{ label: string; filename: string; width: number; height: number; bytes: number }>>;
      };
    };
    const results = await element.editor.exportVariants(
      // 800 and "half of the natural size" are the same file when the source is
      // 1600 wide, so the plan must drop one of them.
      [{ width: 800 }, { width: 400 }, { width: 200, label: "thumb" }, { scale: 0.5 }],
      { format: "image/webp" },
    );
    return { natural: element.editor.outputSize, results };
  });

  expect(variants.results.map((variant) => variant.label)).toEqual(["800w", "400w", "thumb"]);
  expect(variants.results.map((variant) => variant.width)).toEqual([800, 400, 200]);
  // Each name carries its label, and a smaller picture is a smaller file.
  expect(variants.results.map((variant) => variant.filename.includes(variant.label))).toEqual([true, true, true]);
  const bytes = variants.results.map((variant) => variant.bytes);
  expect(bytes[0]).toBeGreaterThan(bytes[1]!);
  expect(bytes[1]).toBeGreaterThan(bytes[2]!);
});

/**
 * The host round trip: send the picture somewhere, get different pixels back,
 * keep the edit. Only a browser can answer whether the canvas really repaints
 * and the history really survives.
 */
test("replacing the source keeps the edit, the history and the annotations", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      replaceSource(input: Blob): Promise<void>;
      editor: {
        document: { source: { resourceId: string; width: number }; layers: unknown[]; crop: unknown };
        historyState: { depth: number; canUndo: boolean };
        addLayer(layer: unknown, options?: unknown): unknown;
        setCropRect(rect: { x: number; y: number; width: number; height: number }): unknown;
        undo(): boolean;
      };
    };
    const { createRectLayer } = (window as unknown as { pixen: Record<string, unknown> }).pixen as {
      createRectLayer: (frame: unknown, options?: unknown) => unknown;
    };

    element.editor.setCropRect({ x: 100, y: 100, width: 600, height: 400 });
    element.editor.addLayer(createRectLayer({ x: 200, y: 200, width: 300, height: 200 }, { id: "mark" }));

    const before = {
      resource: element.editor.document.source.resourceId,
      width: element.editor.document.source.width,
      layers: element.editor.document.layers.length,
      crop: element.editor.document.crop,
      depth: element.editor.historyState.depth,
    };

    // A stand-in for whatever the host sent the picture to: same size, all green.
    const canvas = document.createElement("canvas");
    canvas.width = before.width;
    canvas.height = Math.round((before.width * 1067) / 1600);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#00b140";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const replacement: Blob = await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), "image/png"),
    );

    await element.replaceSource(replacement);

    const after = {
      resource: element.editor.document.source.resourceId,
      layers: element.editor.document.layers.length,
      crop: element.editor.document.crop,
      depth: element.editor.historyState.depth,
      canUndo: element.editor.historyState.canUndo,
    };

    element.editor.undo();
    const undone = element.editor.document.source.resourceId;

    return { before, after, undone };
  });

  // Different pixels, same edit.
  expect(outcome.after.resource).not.toBe(outcome.before.resource);
  expect(outcome.after.layers).toBe(outcome.before.layers);
  expect(outcome.after.crop).toEqual(outcome.before.crop);
  // One more step, and it goes back — a swap is an edit like any other.
  expect(outcome.after.depth).toBe(outcome.before.depth + 1);
  expect(outcome.after.canUndo).toBe(true);
  expect(outcome.undone).toBe(outcome.before.resource);
});

/** Closing lets the picture go without destroying the editor. */
test("closing returns the editor to its empty state, and it can load again", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      close(): void;
      load(input: unknown): Promise<void>;
      editor: { ready: boolean };
    };
    const shadow = element.shadowRoot!;
    const emptyVisible = (): boolean => !(shadow.querySelector(".empty") as HTMLElement).hidden;

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext("2d")!.fillRect(0, 0, 320, 240);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));

    element.close();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const closed = { ready: element.editor.ready, empty: emptyVisible() };

    await element.load(blob);
    return { closed, reopened: { ready: element.editor.ready, empty: emptyVisible() } };
  });

  expect(outcome.closed).toEqual({ ready: false, empty: true });
  expect(outcome.reopened).toEqual({ ready: true, empty: false });
});

/**
 * The status message and the actions share the top row.
 *
 * They did not always: the message was centred and absolutely positioned, so on
 * any host under about 500px it sat on top of the export button. Overlap is a
 * question only a laid-out browser can answer.
 */
test("the status message never covers the actions, at any width", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const measurements = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & { status: string | null };
    const frame = element.parentElement as HTMLElement;
    const shadow = element.shadowRoot!;
    element.status = "Sending to a service that takes its time…";

    const results: Array<{ width: number; overlaps: boolean; shown: boolean }> = [];
    for (const width of [1200, 700, 440, 320]) {
      frame.style.width = `${width}px`;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const busy = shadow.querySelector(".busy")!.getBoundingClientRect();
      const actions = shadow.querySelector(".actions")!.getBoundingClientRect();
      results.push({
        width,
        shown: busy.width > 0 && busy.height > 0,
        overlaps:
          busy.right > actions.left &&
          busy.left < actions.right &&
          busy.bottom > actions.top &&
          busy.top < actions.bottom,
      });
    }
    return results;
  });

  for (const measurement of measurements) {
    expect(measurement.shown, `status visible at ${measurement.width}px`).toBe(true);
    expect(measurement.overlaps, `status overlaps the actions at ${measurement.width}px`).toBe(false);
  }
});

/**
 * The event surface a host integrates against.
 *
 * Progress is the part a unit test cannot check honestly: whether a fetch
 * really reports bytes depends on the browser's streams and on what the server
 * says its length is, and both are only true in a browser.
 */
test("a load announces itself, counts the bytes it can, and ends in a load event", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const timeline = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      load(input: string): Promise<void>;
    };

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    // Noise, so the encoder produces a file big enough to arrive in pieces.
    for (let x = 0; x < 900; x += 3) {
      context.fillStyle = `hsl(${x % 360} 80% ${30 + (x % 40)}%)`;
      context.fillRect(x, 0, 3, 600);
    }
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    const url = URL.createObjectURL(blob);

    const events: string[] = [];
    const reports: Array<{ stage: string; loaded: number; total: number | null; ratio: number | null }> = [];
    const record = (name: string) => (event: Event) => {
      events.push(name);
      if (name === "load-progress") reports.push((event as CustomEvent).detail);
    };
    for (const name of ["load-start", "load-progress", "load-abort", "error"]) {
      element.addEventListener(`pixen-${name}`, record(name));
    }
    element.addEventListener("pixen-load", record("load"));

    await element.load(url);
    URL.revokeObjectURL(url);
    return { events, reports, bytes: blob.size };
  });

  expect(timeline.events.filter((name) => name === "error")).toEqual([]);
  expect(timeline.events.filter((name) => name === "load-abort")).toEqual([]);
  expect(timeline.events[0]).toBe("load-start");
  expect(timeline.events.at(-1)).toBe("load");

  const fetched = timeline.reports.filter((report) => report.stage === "fetch");
  expect(fetched.length).toBeGreaterThan(0);
  expect(fetched.at(-1)!.loaded).toBe(timeline.bytes);
  // Every report is either a real fraction or an honest null. Nothing invents.
  for (const report of timeline.reports) {
    if (report.ratio !== null) expect(report.ratio).toBeGreaterThanOrEqual(0);
    if (report.ratio !== null) expect(report.ratio).toBeLessThanOrEqual(1);
  }
  // The decode cannot be counted, and says so rather than guessing.
  expect(timeline.reports.some((report) => report.stage === "decode" && report.total === null)).toBe(true);
});

test("a cancelled export is an abort rather than an error", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as HTMLElement & {
      editor: { cancelExport(): boolean };
      export(options?: Record<string, unknown>): Promise<unknown>;
    };

    const events: string[] = [];
    for (const name of ["export-start", "export-progress", "export-abort", "error", "export"]) {
      element.addEventListener(`pixen-${name}`, () => events.push(name));
    }

    const running = element.export({ format: "image/jpeg", quality: 0.9 });
    const cancelled = element.editor.cancelExport();
    const code = await running.then(
      () => "resolved",
      (error: { code?: string }) => error.code ?? "unknown",
    );
    return { events, cancelled, code, busy: element.hasAttribute("busy") };
  });

  expect(outcome.cancelled).toBe(true);
  expect(outcome.code).toBe("ABORTED");
  expect(outcome.events).toContain("export-start");
  expect(outcome.events).toContain("export-abort");
  // A cancel is not a failure, and the result of one is never handed over.
  expect(outcome.events).not.toContain("error");
  expect(outcome.events).not.toContain("export");
  expect(outcome.busy).toBe(false);
});

/**
 * Two fingers, dispatched as real touch input.
 *
 * The pinch is the one gesture with no keyboard or mouse equivalent, so nothing
 * else in this suite goes near it, and a unit test can only check the
 * arithmetic — not that the second finger cancels the drag the first one
 * started, which is what stops a pinch from drawing a rectangle.
 */
test.describe("multi-touch", () => {
  test.use({ hasTouch: true });

  test("a two-finger spread zooms instead of drawing", async ({ page }) => {
    await page.goto("/");
    await waitForImage(page);
    await page.evaluate(() => {
      // The rectangle tool, so a one-finger drag would leave something behind.
      (document.querySelector("pixen-image-editor") as EditorElement).tool = "rect";
    });

    const box = (await page.locator("pixen-image-editor").boundingBox())!;
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    const client = await page.context().newCDPSession(page);
    const touch = (type: string, spread: number) =>
      client.send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
          type === "touchEnd"
            ? []
            : [
                { x: midX - spread, y: midY, id: 1 },
                { x: midX + spread, y: midY, id: 2 },
              ],
      });

    const before = await page.evaluate(
      () => (document.querySelector("pixen-image-editor") as unknown as { viewport: { zoom: number } }).viewport.zoom,
    );

    await touch("touchStart", 40);
    await touch("touchMove", 80);
    await touch("touchMove", 120);
    await touch("touchEnd", 0);

    const after = await page.evaluate(() => {
      const element = document.querySelector("pixen-image-editor") as EditorElement & {
        viewport: { zoom: number };
      };
      return { zoom: element.viewport.zoom, layers: element.editor.document.layers.length };
    });

    expect(after.zoom).toBeGreaterThan(before * 1.5);
    // The second finger calls off whatever the first one had begun.
    expect(after.layers).toBe(0);
  });
});

/**
 * A rotated photograph opens the right way up — on a browser that turns it
 * first, and on one that does not.
 *
 * EXIF orientation used to be the application's job, and Pixen did it. Chromium
 * now does it too, for all eight orientations, and does not stop when asked for
 * the pixels as stored — so doing it as well turned every rotated photograph
 * twice. No unit test could see that: the double turn is a property of the
 * decoder, and node has no decoder.
 *
 * Each of the eight is checked by where the colours land rather than by the
 * size alone, because half of them are flips and mirrors that leave the size
 * exactly as it was.
 *
 * One branch this cannot reach: a decoder that does *not* turn the picture, in
 * which case Pixen turns it. That is the behaviour this file has always had,
 * and `exif.test.ts` covers the transform it uses — but a browser that always
 * orients cannot be made to demonstrate the other path, so it is not claimed
 * here that it did.
 */
test("all eight EXIF orientations open upright, whatever the browser did first", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      load(input: unknown): Promise<void>;
    };

    const short = (value: number) => [value >> 8, value & 0xff];
    /** An APP1 saying only "this is how the picture is stored". */
    const orientationExif = (orientation: number) => [
      0xff, 0xe1, ...short(0x22), ...[...new TextEncoder().encode("Exif")], 0, 0,
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, ...short(orientation), 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ];

    // Four quadrants, so a mirror is as visible as a quarter turn. Wider than
    // tall, so the turns that swap the axes are visible in the size too.
    const WIDE = 64;
    const TALL = 32;
    const canvas = document.createElement("canvas");
    canvas.width = WIDE;
    canvas.height = TALL;
    const context = canvas.getContext("2d")!;
    const quadrants = [
      ["#ff0000", 0, 0],
      ["#00ff00", WIDE / 2, 0],
      ["#0000ff", 0, TALL / 2],
      ["#ffff00", WIDE / 2, TALL / 2],
    ] as const;
    for (const [colour, x, y] of quadrants) {
      context.fillStyle = colour;
      context.fillRect(x, y, WIDE / 2, TALL / 2);
    }
    const stored: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 1));
    const storedBytes = new Uint8Array(await stored.arrayBuffer());

    const name = (r: number, g: number, b: number) => {
      const lit = (value: number) => value > 140;
      if (lit(r) && lit(g)) return "Y";
      if (lit(r)) return "R";
      if (lit(g)) return "G";
      if (lit(b)) return "B";
      return "?";
    };

    /** What the exported picture looks like: its size, then its four quadrants. */
    const readBack = async (orientation: number) => {
      const tagged = new Uint8Array([0xff, 0xd8, ...orientationExif(orientation), ...storedBytes.subarray(2)]);
      await element.load(new Blob([tagged as BlobPart], { type: "image/jpeg" }));

      const surface = element.editor.renderToCanvas().canvas;
      const read = surface.getContext("2d") as CanvasRenderingContext2D;
      const at = (fx: number, fy: number) => {
        const data = read.getImageData(Math.round(surface.width * fx), Math.round(surface.height * fy), 1, 1).data;
        return name(data[0]!, data[1]!, data[2]!);
      };
      return `${surface.width}x${surface.height} ${at(0.25, 0.25)}${at(0.75, 0.25)}${at(0.25, 0.75)}${at(0.75, 0.75)}`;
    };

    const seen: Record<string, string> = {};
    for (let orientation = 1; orientation <= 8; orientation += 1) {
      seen[`o${orientation}`] = await readBack(orientation);
    }
    return seen;
  });

  // Derived from what each tag means, not from what a browser happens to do.
  // The stored quadrants are R G / B Y, and the tag says how the stored data
  // relates to the picture it is meant to be:
  //
  //   1  as stored                          R G / B Y
  //   2  mirrored left to right             G R / Y B
  //   3  turned half way round              Y B / G R
  //   4  mirrored top to bottom             B Y / R G
  //   5  mirrored, then a quarter turn anticlockwise   R B / G Y
  //   6  a quarter turn clockwise           B R / Y G
  //   7  mirrored, then a quarter turn clockwise       Y G / B R
  //   8  a quarter turn anticlockwise       G Y / R B
  //
  // The four turns swap the axes, so those come back 32x64.
  expect(outcome).toEqual({
    o1: "64x32 RGBY",
    o2: "64x32 GRYB",
    o3: "64x32 YBGR",
    o4: "64x32 BYRG",
    o5: "32x64 RBGY",
    o6: "32x64 BRYG",
    o7: "32x64 YGBR",
    o8: "32x64 GYRB",
  });
});

/**
 * The names a host styles and slots into, pinned.
 *
 * `template.ts` says it in a comment — "renaming one is a breaking change" — and
 * CLAUDE.md counts `part` and slot names among the contracts alongside the
 * package exports. Nothing enforced it. A rename from `tool-rail` to `rail`
 * would pass every suite and break the CSS of every application that had styled
 * it, silently, because `::part(tool-rail)` that matches nothing is not an
 * error in any browser.
 *
 * Read from the rendered shadow root rather than from the source, so a part
 * built at runtime counts the same as one written in the template. Two states
 * are checked because a part that only exists while an image is loaded is still
 * a name a host may have styled.
 *
 * Changing this list is allowed. It is a decision, and the diff should say so.
 */
const PUBLIC_PARTS = [
  "actions",
  "busy",
  "canvas",
  "dropzone",
  "empty",
  "inspector",
  "root",
  "text-input",
  "tool-rail",
];
const PUBLIC_SLOTS = ["actions", "inspector", "tools"];

test("the part and slot names a host builds against do not move", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const surface = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & { close(): void };
    const shadow = element.shadowRoot!;
    const read = () => ({
      parts: [...shadow.querySelectorAll("[part]")].map((node) => node.getAttribute("part")!).sort(),
      slots: [...shadow.querySelectorAll("slot")].map((node) => node.getAttribute("name") ?? "").sort(),
    });

    const loaded = read();
    element.close();
    return { loaded, empty: read() };
  });

  expect(surface.loaded.parts).toEqual(PUBLIC_PARTS);
  expect(surface.loaded.slots).toEqual(PUBLIC_SLOTS);
  // The empty state is a state a host styles too, not a gap in the contract.
  expect(surface.empty.parts).toEqual(PUBLIC_PARTS);
  expect(surface.empty.slots).toEqual(PUBLIC_SLOTS);
});

/**
 * The pixels a host wants changed before anyone edits them.
 *
 * `beforeDecode` takes bytes no browser reads; `afterDecode` takes the decoded
 * picture — a colour profile, a denoiser, a background composited under a
 * transparent PNG. Only a real decoder can hand over real pixels, so the claim
 * that what the hook returns is what gets edited and exported belongs here.
 */
test("afterDecode replaces the picture the editor goes on to edit", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      load(input: unknown, options?: Record<string, unknown>): Promise<void>;
    };

    const source = document.createElement("canvas");
    source.width = 200;
    source.height = 100;
    const context = source.getContext("2d")!;
    context.fillStyle = "#204080";
    context.fillRect(0, 0, 200, 100);
    const blob: Blob = await new Promise((resolve) => source.toBlob((b) => resolve(b!), "image/png"));

    const seen: Array<{ width: number; height: number }> = [];
    // Stored options are the fallback, not the rule: the one passed to load()
    // has to win, or a host cannot override its own default for one picture.
    let storedRan = false;
    (element as unknown as { decodeOptions: Record<string, unknown> }).decodeOptions = {
      afterDecode: (image: { source: CanvasImageSource }) => {
        storedRan = true;
        return image.source;
      },
    };
    await element.load(blob, {
      afterDecode: (image: { source: CanvasImageSource; width: number; height: number }) => {
        seen.push({ width: image.width, height: image.height });
        // Half the size and a colour that is nowhere in what went in, so both
        // "the size is the hook's" and "the pixels are the hook's" are visible.
        const half = document.createElement("canvas");
        half.width = image.width / 2;
        half.height = image.height / 2;
        const paint = half.getContext("2d")!;
        paint.fillStyle = "#f08000";
        paint.fillRect(0, 0, half.width, half.height);
        return half;
      },
    });

    const exported = await element.export({ format: "image/png" });
    const bitmap = await createImageBitmap(exported.blob);
    const readback = document.createElement("canvas");
    readback.width = bitmap.width;
    readback.height = bitmap.height;
    const read = readback.getContext("2d")!;
    read.drawImage(bitmap, 0, 0);
    const middle = read.getImageData(Math.round(bitmap.width / 2), Math.round(bitmap.height / 2), 1, 1).data;

    return {
      seen,
      storedRan,
      document: { width: element.editor.document.source.width, height: element.editor.document.source.height },
      exported: { width: exported.width, height: exported.height },
      middle: [middle[0], middle[1], middle[2]],
    };
  });

  // Handed the decoded picture, once, at the size it really decoded to.
  expect(outcome.seen).toEqual([{ width: 200, height: 100 }]);
  // The stored default was overridden rather than run as well.
  expect(outcome.storedRan).toBe(false);

  // What came back is the picture: its size is the document's...
  expect(outcome.document).toEqual({ width: 100, height: 50 });
  expect(outcome.exported).toEqual({ width: 100, height: 50 });

  // ...and its pixels are the ones exported. Orange in, orange out; the blue
  // that was decoded never reaches the file.
  const [r, g, b] = outcome.middle;
  expect(r).toBeGreaterThan(200);
  expect(g).toBeGreaterThan(90);
  expect(b).toBeLessThan(60);
});

/**
 * ...and reaches the picture however it arrived.
 *
 * The hook exists for formats and pixels the browser gets wrong, and those
 * arrive by being dropped or pasted far more often than through a `load()` a
 * host wrote. A seam that only works on the one entry point nobody uses is not
 * a seam, so `decodeOptions` is set on the element and a real paste has to go
 * through it.
 */
test("decodeOptions reach a pasted image, not only an explicit load", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      decodeOptions: Record<string, unknown>;
    };

    let called = 0;
    element.decodeOptions = {
      afterDecode: (image: { source: CanvasImageSource; width: number; height: number }) => {
        called += 1;
        const half = document.createElement("canvas");
        half.width = Math.round(image.width / 2);
        half.height = Math.round(image.height / 2);
        half.getContext("2d")!.drawImage(image.source, 0, 0, half.width, half.height);
        return half;
      },
    };

    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 160;
    canvas.getContext("2d")!.fillRect(0, 0, 240, 160);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));

    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));

    // The paste handler loads asynchronously; wait for the document to change.
    const deadline = Date.now() + 5000;
    while (element.editor.document.source.width !== 120 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { called, source: element.editor.document.source.width };
  });

  expect(outcome.called).toBe(1);
  // Halved by the hook, so the picture the editor holds is the hook's.
  expect(outcome.source).toBe(120);
});

/**
 * A ceiling that scales the picture instead of refusing it.
 *
 * What a browser will really allocate is far below what the specification
 * allows, and low enough on some phones that a photograph from the same phone
 * does not fit. The failure mode is the reason this exists: an over-large canvas
 * comes back blank rather than throwing, so the export is silently wrong.
 *
 * A host that knows its device says so, and gets a smaller picture rather than
 * an error or an empty one. Checked here rather than in a unit test because the
 * claim is about a file that really encoded and really decodes.
 */
test("an export past the pixel ceiling comes back smaller, not empty", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const CEILING = 120_000;

    const read = async (options: Record<string, unknown>) => {
      const result = await element.export({ format: "image/png", ...options } as never);
      const bitmap = await createImageBitmap(result.blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      // A blank export is the failure this guards against, so count what is
      // actually painted rather than trusting the size alone.
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4 * 37) if (data[i]! > 0) painted += 1;
      return { reported: { width: result.width, height: result.height }, decoded: [bitmap.width, bitmap.height], painted };
    };

    return {
      ceiling: CEILING,
      unlimited: await read({ width: 900 }),
      capped: await read({ width: 900, maxPixels: CEILING }),
      roomy: await read({ width: 900, maxPixels: 10_000_000 }),
    };
  });

  // Without a ceiling, the size asked for is the size delivered.
  expect(outcome.unlimited.reported.width).toBe(900);

  // With one, the picture is scaled to fit it — and the result says so, which is
  // the only way a host can know what it actually got.
  const { width, height } = outcome.capped.reported;
  expect(width * height).toBeLessThanOrEqual(outcome.ceiling);
  expect(width).toBeLessThan(900);
  expect(outcome.capped.decoded).toEqual([width, height]);
  // Same shape, and a real picture rather than an empty canvas.
  expect(width / height).toBeCloseTo(
    outcome.unlimited.reported.width / outcome.unlimited.reported.height,
    1,
  );
  expect(outcome.capped.painted).toBeGreaterThan(0);

  // A ceiling nothing reaches changes nothing.
  expect(outcome.roomy.reported).toEqual(outcome.unlimited.reported);
});

/**
 * The camera's own record of the picture, carried across a re-encode.
 *
 * Only a real encoder produces a JPEG to splice a block into and a real decoder
 * proves the result still opens, so this is the one place the whole path can be
 * checked: a source with EXIF goes in, an edited file comes out, and the right
 * parts of the record are on it. The rewriting itself is unit tested against
 * hand-built directories; what is checked here is that it is wired up, that the
 * default is still to strip, and that a file with metadata spliced in front of
 * it is a file the browser will still decode.
 */
test("metadata travels only when asked, and leaves the location behind", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      load(input: unknown): Promise<void>;
    };

    // A JPEG the browser really encoded, with an EXIF block put in front of it
    // by hand — assembled here rather than through Pixen's own splicer, so this
    // is not the code under test vouching for itself.
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#3060a0";
    context.fillRect(0, 0, 400, 300);
    const plain: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));

    const ascii = (value: string) => [...new TextEncoder().encode(value)];
    const short = (value: number) => [value >> 8, value & 0xff];
    const long = (value: number) => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    const entry = (tag: number, type: number, count: number, value: number[]) => [
      ...short(tag),
      ...short(type),
      ...long(count),
      ...value,
    ];

    const make = "PIXEN-CAMERA-MARK";
    const place = "PIXEN-LOCATION-MARK";
    // TIFF header, one directory of three entries, then the values they point at.
    const ifd0At = 8;
    const entriesEnd = ifd0At + 2 + 3 * 12 + 4;
    const makeAt = entriesEnd;
    const gpsAt = makeAt + make.length + 1;
    const placeAt = gpsAt + 2 + 12 + 4;
    const tiff = [
      ...ascii("MM"),
      ...short(0x002a),
      ...long(ifd0At),
      ...short(3),
      ...entry(0x010f, 2, make.length + 1, long(makeAt)), // Make
      ...entry(0x0112, 3, 1, [...short(6), 0, 0]), // Orientation: a quarter turn
      ...entry(0x8825, 4, 1, long(gpsAt)), // GPS directory
      ...long(0),
      ...ascii(`${make}\0`),
      ...short(1),
      ...entry(0x0001, 2, place.length, long(placeAt)),
      ...long(0),
      ...ascii(place),
    ];
    const payload = [...ascii("Exif"), 0, 0, ...tiff];
    const app1 = [0xff, 0xe1, ...short(payload.length + 2), ...payload];

    const encoded = new Uint8Array(await plain.arrayBuffer());
    const withExif = new Uint8Array([0xff, 0xd8, ...app1, ...encoded.subarray(2)]);
    await element.load(new Blob([withExif as BlobPart], { type: "image/jpeg" }));

    const read = async (options: Record<string, unknown>) => {
      const result = await element.export({ format: "image/jpeg", ...options } as never);
      const text = new TextDecoder("latin1").decode(new Uint8Array(await result.blob.arrayBuffer()));
      // Decoding it proves the spliced file is still a JPEG a browser will open.
      const bitmap = await createImageBitmap(result.blob);
      return {
        make: text.includes(make),
        place: text.includes(place),
        width: bitmap.width,
        height: bitmap.height,
      };
    };

    return {
      source: { width: element.editor.document.source.width, height: element.editor.document.source.height },
      byDefault: await read({}),
      stripped: await read({ metadata: "strip" }),
      copied: await read({ metadata: "copy" }),
      asPng: await read({ metadata: "copy", format: "image/png" }),
    };
  });

  // Orientation 6 turns a quarter, so the 400x300 source is upright at 300x400 —
  // proof the pixels really were rotated, which is why the tag must not travel.
  expect(outcome.source).toEqual({ width: 300, height: 400 });

  // Nothing rides along unless a host asks for it.
  expect(outcome.byDefault).toMatchObject({ make: false, place: false });
  expect(outcome.stripped).toMatchObject({ make: false, place: false });

  // Asked for: the camera, never the location.
  expect(outcome.copied.make).toBe(true);
  expect(outcome.copied.place).toBe(false);
  // And still a picture, the right way up, after the splice.
  expect(outcome.copied).toMatchObject({ width: 300, height: 400 });

  // PNG has no EXIF worth the name, so there is nowhere for it to go.
  expect(outcome.asPng).toMatchObject({ make: false, place: false });
});

/**
 * The resampling seam, and the rule for when it opens.
 *
 * A host only reaches for its own downscaler because it does not trust the
 * browser's, so two things have to be true: it is asked at the moment a large
 * reduction is about to happen, and what it hands back is what gets drawn. Both
 * need real pixels — the second is only visible in the exported file.
 */
test("the resample hook is offered a large downscale, and its pixels are the ones exported", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const result = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const asked: Array<{ from: { width: number }; to: { width: number; height: number } }> = [];

    const resample = (
      _source: CanvasImageSource,
      from: { width: number; height: number },
      to: { width: number; height: number },
    ) => {
      asked.push({ from, to });
      // Flat green, so "the host's pixels were drawn" is unmistakable in the
      // exported file — nothing in the photograph looks like this.
      const stand = document.createElement("canvas");
      stand.width = to.width;
      stand.height = to.height;
      const context = stand.getContext("2d")!;
      context.fillStyle = "#00ff00";
      context.fillRect(0, 0, to.width, to.height);
      return stand;
    };

    // Crop to a square first, so the crop is a *part* of the frame: that is the
    // only arrangement where "shrink the bitmap by the crop's factor" and
    // "shrink the bitmap to the export size" are different numbers.
    element.editor.setAspectRatio(1);
    const source = element.editor.document.source.width;
    const crop = element.editor.cropRect;
    // Barely a reduction — three quarters of the crop — so one draw already
    // samples it fairly and the hook has nothing to offer. It is not called.
    await element.export({ width: Math.round(crop.width * 0.75), format: "image/png", hooks: { resample } } as never);
    const afterModest = asked.length;

    const exported = await element.export({ width: 64, format: "image/png", hooks: { resample } } as never);
    const bitmap = await createImageBitmap(exported.blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const centre = canvas
      .getContext("2d")!
      .getImageData(Math.round(bitmap.width / 2), Math.round(bitmap.height / 2), 1, 1).data;

    return { afterModest, asked, source, crop, exported: bitmap.width, centre: [centre[0], centre[1], centre[2]] };
  });

  // Not called for a modest reduction, where one draw is already fair.
  expect(result.afterModest).toBe(0);
  expect(result.asked).toHaveLength(1);

  const [call] = result.asked;
  expect(call!.from.width).toBe(result.source);
  expect(result.crop.width).toBeLessThan(result.source);
  // Asked for the whole bitmap at the shrink the *crop* needs, not for the
  // export size — the scene still has to place the crop against it, so a bitmap
  // shrunk to the export size would arrive already too small.
  expect(call!.to.width).toBeGreaterThan(result.exported);
  expect(call!.to.width).toBe(Math.round((result.source * result.exported) / result.crop.width));
  expect(call!.to.width).toBeLessThan(call!.from.width);

  // The host's green, not the photograph: what it returned is what was drawn.
  expect(result.centre[0]).toBeLessThan(60);
  expect(result.centre[1]).toBeGreaterThan(200);
  expect(result.centre[2]).toBeLessThan(60);
});

/**
 * The pipeline a host bends: hooks, and delivery.
 *
 * Every one of these runs against real canvas pixels and a real request, which
 * is the only place they can be checked — a hook handed a surface has nothing
 * to draw on in node, and an upload with no XMLHttpRequest never starts.
 */
test("export hooks reach the document, the pixels, the bytes and the name", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const result = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const seen: string[] = [];

    const output = await element.export({
      format: "image/png",
      hooks: {
        document: (doc: { adjustments: Record<string, number> }) => {
          seen.push("document");
          // Something visible in the exported pixels and nowhere else.
          return { ...doc, adjustments: { ...doc.adjustments, grayscale: 1 } };
        },
        pixels: (surface: { context: CanvasRenderingContext2D }, size: { width: number; height: number }) => {
          seen.push("pixels");
          const context = surface.context;
          context.globalCompositeOperation = "destination-in";
          context.beginPath();
          context.arc(size.width / 2, size.height / 2, size.width / 2, 0, Math.PI * 2);
          context.fill();
          context.globalCompositeOperation = "source-over";
        },
        bytes: (blob: Blob) => {
          seen.push("bytes");
          return blob;
        },
        filename: (suggested: string) => {
          seen.push("filename");
          return `masked-${suggested}`;
        },
      },
    } as never);

    // Read a corner and the centre back out of the exported file.
    const bitmap = await createImageBitmap(output.blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const alphaAt = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3]!;
    const centre = context.getImageData(bitmap.width / 2, bitmap.height / 2, 1, 1).data;

    return {
      seen,
      filename: output.filename,
      cornerAlpha: alphaAt(2, 2),
      centreAlpha: alphaAt(Math.round(bitmap.width / 2), Math.round(bitmap.height / 2)),
      centre: [centre[0], centre[1], centre[2]],
    };
  });

  expect(result.seen).toEqual(["document", "pixels", "bytes", "filename"]);
  expect(result.filename).toMatch(/^masked-/);
  // The circular mask cut the corner out and left the middle.
  expect(result.cornerAlpha).toBe(0);
  expect(result.centreAlpha).toBeGreaterThan(0);
  // The document hook's grayscale reached the exported pixels.
  const [r, g, b] = result.centre;
  expect(Math.abs(r! - g!)).toBeLessThanOrEqual(2);
  expect(Math.abs(g! - b!)).toBeLessThanOrEqual(2);
});

test("exportTo delivers the file and counts the bytes going out", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  let received: { hasFile: boolean; caption: string | null } = { hasFile: false, caption: null };
  await page.route("**/pixen-test-upload", async (route) => {
    // latin1, not utf8: the multipart body carries JPEG bytes between the text
    // parts, and decoding those as UTF-8 mangles the headers around them.
    const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
    received = { hasFile: /filename="[^"]*edited[^"]*"/.test(body), caption: /Hello/.test(body) ? "Hello" : null };
    await route.fulfill({ status: 201, body: "stored" });
  });

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const stages: string[] = [];
    element.addEventListener("pixen-export-progress", (event) => {
      stages.push((event as CustomEvent<{ stage: string }>).detail.stage);
    });

    const response = await element.editor.exportTo(
      {
        url: "/pixen-test-upload",
        fields: (result: { blob: Blob; filename: string }) => [
          ["file", result.blob, result.filename],
          ["caption", "Hello"],
        ],
      },
      { format: "image/jpeg" },
    );
    return { status: response.status, body: response.body, stages };
  });

  expect(outcome.status).toBe(201);
  expect(outcome.body).toBe("stored");
  expect(received.hasFile).toBe(true);
  expect(received.caption).toBe("Hello");
  // One task, three kinds of step: drawing, encoding, and going out. Only the
  // upload's start is asserted — a request Playwright intercepts never fires
  // `xhr.upload` progress events, so the byte counts have no server to come
  // from here.
  expect(outcome.stages).toContain("render");
  expect(outcome.stages).toContain("encode");
  expect(outcome.stages).toContain("upload");
});

test("renderToCanvas hands over pixels without encoding them", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const drawn = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const surface = element.editor.renderToCanvas();
    const context = surface.canvas.getContext("2d") as CanvasRenderingContext2D;
    const { data } = context.getImageData(0, 0, surface.canvas.width, surface.canvas.height);

    let opaque = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i]! > 0) opaque += 1;
    return {
      size: { width: surface.canvas.width, height: surface.canvas.height },
      output: element.editor.outputSize,
      opaque,
    };
  });

  expect(drawn.size).toEqual(drawn.output);
  expect(drawn.opaque).toBeGreaterThan(0);
});

/**
 * A scrambled redaction has to be the same scramble every time.
 *
 * The preview and the exported file are drawn from the same document by the
 * same code, so an order taken from the moment of drawing rather than from the
 * document would give a host a file that does not match what its user approved.
 */
test("a scrambled redaction exports identically twice, and differs per layer", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        document: { source: { width: number; height: number } };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
        removeLayer(id: string): void;
      };
    };

    const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer()).join(",");
    const { width, height } = element.editor.document.source;
    const frame = { x: width * 0.06, y: height * 0.12, width: width * 0.34, height: height * 0.2 };
    const redaction = (id: string) => ({
      id,
      type: "redact" as const,
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      frame,
      mode: "scramble" as const,
      strength: 0.03,
      colour: "#12161c",
    });

    element.editor.addLayer(redaction("redact_one"), { select: false });
    const first = await bytesOf((await element.export({ format: "image/png" })).blob);
    const again = await bytesOf((await element.export({ format: "image/png" })).blob);
    element.editor.removeLayer("redact_one");

    element.editor.addLayer(redaction("redact_two"), { select: false });
    const other = await bytesOf((await element.export({ format: "image/png" })).blob);
    element.editor.removeLayer("redact_two");

    return { repeatable: first === again, perLayer: first !== other };
  });

  expect(outcome.repeatable).toBe(true);
  // A different layer gets a different arrangement, so two redactions side by
  // side do not shuffle into the same pattern.
  expect(outcome.perLayer).toBe(true);
});

/**
 * A mask has to line up with the picture it came from.
 *
 * It is built by recolouring the same draw-op list the editor renders, so the
 * crop, the output size and every layer's own rotation are already resolved —
 * but "already resolved" is a claim about real pixels, and only a browser can
 * check where they landed.
 */
test("a mask marks where the annotations are and nothing else", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const sampled = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        document: { source: { width: number; height: number } };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
        renderMask(options?: Record<string, unknown>): { canvas: HTMLCanvasElement };
      };
    };

    const { width, height } = element.editor.document.source;
    // An outlined rectangle over the left third, nothing on the right.
    element.editor.addLayer(
      {
        id: "marked",
        type: "rect",
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        frame: { x: width * 0.1, y: height * 0.2, width: width * 0.2, height: height * 0.3 },
        stroke: { color: "#ef3e36", width: 6 },
      },
      { select: false },
    );

    const mask = element.editor.renderMask({ padding: 0.01 });
    const context = mask.canvas.getContext("2d") as CanvasRenderingContext2D;
    const at = (fx: number, fy: number) => {
      const [r, g, b, a] = context.getImageData(
        Math.round(mask.canvas.width * fx),
        Math.round(mask.canvas.height * fy),
        1,
        1,
      ).data;
      return { r: r!, g: g!, b: b!, a: a! };
    };

    return {
      size: { width: mask.canvas.width, height: mask.canvas.height },
      output: element.editor.outputSize,
      // Inside the rectangle, just outside it, and far away on the right.
      inside: at(0.2, 0.35),
      justOutside: at(0.305, 0.35),
      elsewhere: at(0.85, 0.7),
    };
  });

  expect(sampled.size).toEqual(sampled.output);
  // An outline marks what it encloses, so the middle of the shape is white.
  expect(sampled.inside).toMatchObject({ r: 255, g: 255, b: 255, a: 255 });
  // The padding pushes the mark past the shape's own edge.
  expect(sampled.justOutside.r).toBe(255);
  // Everywhere else is background, and the photograph is not in it.
  expect(sampled.elsewhere).toMatchObject({ r: 0, g: 0, b: 0, a: 255 });
});

/**
 * Every button in the chrome has to be announceable.
 *
 * The text buttons — a ratio, a preset, a format, a redaction mode — each used
 * to repeat their visible text as their accessible name by hand, which is one
 * copy per button that can be forgotten. `textButton` fills it in, and this is
 * the assertion that the filling in actually happens.
 */
test("every button carries an accessible name and a tooltip", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const buttons = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    // Open the panels that build the rest of the buttons, so this covers more
    // than whichever tool happens to be armed at load.
    const shadow = element.shadowRoot!;
    return [...shadow.querySelectorAll("button")].map((node) => ({
      text: node.textContent?.trim() ?? "",
      label: node.getAttribute("aria-label"),
      title: node.title,
      pressed: node.getAttribute("aria-pressed"),
    }));
  });

  expect(buttons.length).toBeGreaterThan(8);
  for (const button of buttons) {
    expect(button.label, `aria-label for "${button.text}"`).toBeTruthy();
    expect(button.title, `title for "${button.text}"`).toBe(button.label);
    // A visible label must be part of its accessible name, or a voice user
    // saying what they see does not reach the control they are looking at.
    if (button.text) expect(button.label).toContain(button.text);
  }
  // A toggle says whether it is on, not merely that it exists.
  expect(buttons.some((button) => button.pressed === "true")).toBe(true);
});

/**
 * The three accessibility affordances the coverage page names beyond the button
 * labels: the keyboard shortcut a control announces, the toggle state it
 * announces, and the live region that speaks without moving focus.
 *
 * All three are DOM attributes, and the row's only evidence was
 * `labels.test.ts`, which contains no `aria` at all — it tests the *text* of a
 * label, not the semantics carried beside it.
 */
test("controls announce their shortcut and their state, and the editor can speak", async ({ page }) => {
  await page.goto("/");
  await waitForImage(page);

  const surface = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const shadow = element.shadowRoot!;

    const status = shadow.querySelector('[part="busy"], [role="status"]') as HTMLElement | null;
    const before = status?.textContent ?? "";

    // Opening a panel is the announcement path: the editor says what opened
    // rather than moving focus into it.
    const layers = [...shadow.querySelectorAll("button")].find((node) =>
      /layers/i.test(node.getAttribute("aria-label") ?? ""),
    );
    layers?.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const live = [...shadow.querySelectorAll("[aria-live]")].map((node) => ({
      politeness: node.getAttribute("aria-live"),
      role: node.getAttribute("role"),
      text: node.textContent?.trim() ?? "",
    }));

    return {
      before,
      live,
      shortcuts: [...shadow.querySelectorAll("[aria-keyshortcuts]")].map((node) => ({
        label: node.getAttribute("aria-label"),
        keys: node.getAttribute("aria-keyshortcuts"),
      })),
      toggles: [...shadow.querySelectorAll("[aria-pressed]")].map((node) => node.getAttribute("aria-pressed")),
    };
  });

  // Every control with a shortcut says what it is, so a screen-reader user can
  // learn it without reading the tooltip.
  expect(surface.shortcuts.length).toBeGreaterThan(4);
  for (const shortcut of surface.shortcuts) {
    expect(shortcut.keys, `aria-keyshortcuts for "${shortcut.label}"`).toBeTruthy();
  }

  // Toggles carry a state rather than only a name, and at least one is on.
  expect(surface.toggles.length).toBeGreaterThan(4);
  expect(surface.toggles).toContain("true");
  expect(surface.toggles.every((state) => state === "true" || state === "false")).toBe(true);

  // And there is somewhere to speak from: polite, so it waits its turn rather
  // than interrupting whatever the reader is in the middle of.
  const polite = surface.live.filter((node) => node.politeness === "polite");
  expect(polite.length).toBeGreaterThan(0);
  expect(polite.some((node) => node.role === "status")).toBe(true);
  // The panel that just opened was announced into it.
  expect(polite.some((node) => node.text.length > 0)).toBe(true);
});

test("a caption is finished by the click that starts the next gesture", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).tool = "text";
  });
  const stage = await page.evaluate(
    () => (document.querySelector("pixen-image-editor") as EditorElement).editor.stageSize,
  );
  const caption = await stageToClient(page, { x: stage.width * 0.2, y: stage.height * 0.2 });
  await page.mouse.click(caption.x, caption.y);
  const box = page.locator("pixen-image-editor").locator("textarea.text-input");
  await box.waitFor({ state: "visible" });
  await page.keyboard.type("hello");

  // Draw a rectangle without pressing Escape first, which is what anyone does.
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement & { tool: string }).tool = "rect";
  });
  const from = await stageToClient(page, { x: stage.width * 0.55, y: stage.height * 0.75 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  // The caption used to survive none of this: its transaction was still open,
  // so the rectangle's begin-transaction threw, and the rollback on the way out
  // tore up the caption instead of the rectangle that never got drawn.
  expect(errors).toEqual([]);
  await expect(box).toBeHidden();

  const after = await state(page);
  const kinds = after.document.layers.map((layer) => (layer as { type: string }).type);
  expect(kinds).toEqual(["text", "rect"]);
  expect((after.document.layers[0] as { text: string; visible: boolean }).text).toBe("hello");
  expect((after.document.layers[0] as { visible: boolean }).visible).toBe(true);
  // Two edits, two steps: the caption is not swept into the rectangle's.
  expect(after.history.depth).toBe(2);
});

test("a style control never writes onto a layer of another kind", async ({ page }) => {
  // A rectangle stays selected while the text tool is armed, and the style
  // section is built from the tool — so the alignment buttons are on screen
  // with a rectangle underneath them.
  await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        document: { source: { width: number; height: number } };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
      };
      tool: string;
    };
    const { width, height } = element.editor.document.source;
    element.editor.addLayer(
      {
        id: "rect_under_test",
        type: "rect",
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        frame: { x: width * 0.2, y: height * 0.2, width: width * 0.3, height: height * 0.3 },
        color: "#ff0000",
        fill: null,
        strokeWidth: 4,
        dash: null,
        cornerRadius: 0,
      },
      { select: true },
    );
    element.tool = "text";
  });

  const align = page.locator("pixen-image-editor").locator("button", { hasText: "Left" }).first();
  await expect(align).toBeVisible();
  await align.click();

  const rect = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    return element.editor.document.layers.find((layer) => (layer as { id: string }).id === "rect_under_test");
  });
  // `updateLayer` spreads a patch without asking what it is patching, so this
  // used to leave `align: "left"` on a rectangle, in the document and in the
  // undo history.
  expect(rect).toBeDefined();
  expect(rect).not.toHaveProperty("align");
});

test("the crop tool's configured ratio is applied to a picture as it loads", async ({ page }) => {
  const ratio = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      tools: unknown;
      load(input: Blob): Promise<void>;
      editor: { document: { aspectRatio: number | null }; cropRect: { width: number; height: number } };
    };
    // Configure the tool the way a host would, then load a picture into it.
    element.tools = [{ type: "crop", options: { defaultRatio: 1 } }, "select"];

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#3366cc";
    context.fillRect(0, 0, 800, 600);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!), "image/png"));
    await element.load(blob);

    const crop = element.editor.cropRect;
    return { aspectRatio: element.editor.document.aspectRatio, crop: crop.width / crop.height };
  });

  // `defaultRatio` was documented and read by nothing, so a host that asked for
  // square crops got freeform ones with no sign the option had been ignored.
  expect(ratio.aspectRatio).toBe(1);
  expect(ratio.crop).toBeCloseTo(1, 2);
});

test("the finished picture comes out as raw pixels as well as a file", async ({ page }) => {
  // The third shape an export takes. A host feeding a model or a WASM filter
  // wants the bytes, and every container in the way is something to undo.
  const read = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const pixels = element.editor.renderToImageData({ target: { width: 40, height: 30 } });
    const at = (fx: number, fy: number) => {
      const x = Math.round(pixels.width * fx);
      const y = Math.round(pixels.height * fy);
      const index = (y * pixels.width + x) * 4;
      return [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2], pixels.data[index + 3]];
    };
    return {
      kind: pixels.constructor.name,
      width: pixels.width,
      height: pixels.height,
      length: pixels.data.length,
      sky: at(0.5, 0.15),
      ground: at(0.5, 0.9),
    };
  });

  expect(read.kind).toBe("ImageData");
  expect({ width: read.width, height: read.height }).toEqual({ width: 40, height: 30 });
  // Four bytes a pixel, which is what makes it worth having over a canvas.
  expect(read.length).toBe(40 * 30 * 4);
  // The sample is a sky over a dark landscape, so the two ends of it differ and
  // both are opaque — a blank or transparent buffer would pass a size check.
  expect(read.sky[3]).toBe(255);
  expect(read.ground[3]).toBe(255);
  expect(read.sky).not.toEqual(read.ground);
});

test("a host can swap the picture for one export without touching the document", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: { document: { source: { width: number; height: number } } };
      export(options?: Record<string, unknown>): Promise<{ blob: Blob; width: number; height: number }>;
    };
    const before = { ...element.editor.document.source };

    // A stand-in at half the size, in four quadrants. Flat colour would prove
    // only that the hook ran; four corners prove where the picture landed.
    const stand = document.createElement("canvas");
    stand.width = Math.round(before.width / 2);
    stand.height = Math.round(before.height / 2);
    const paint = stand.getContext("2d")!;
    const quadrants = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    for (const [index, colour] of quadrants.entries()) {
      paint.fillStyle = colour;
      paint.fillRect(
        (index % 2) * (stand.width / 2),
        Math.floor(index / 2) * (stand.height / 2),
        stand.width / 2,
        stand.height / 2,
      );
    }

    const written = await element.export({
      format: "image/png",
      hooks: { source: () => stand },
    });

    const bitmap = await createImageBitmap(written.blob);
    const read = document.createElement("canvas");
    read.width = bitmap.width;
    read.height = bitmap.height;
    const context = read.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const at = (fx: number, fy: number) => {
      const { data } = context.getImageData(Math.round(read.width * fx), Math.round(read.height * fy), 1, 1);
      return `${data[0]},${data[1]},${data[2]}`;
    };

    return {
      corners: [at(0.2, 0.2), at(0.8, 0.2), at(0.2, 0.8), at(0.8, 0.8)],
      documentSource: element.editor.document.source,
      unchanged: element.editor.document.source.width === before.width,
    };
  });

  // The four quadrants land in the four corners: the stand-in was stretched
  // across the whole frame, at the size the document says the picture is,
  // rather than drawn at its own size into part of it.
  expect(result.corners).toEqual(["255,0,0", "0,255,0", "0,0,255", "255,255,0"]);
  // And the document still describes the picture it was loaded with.
  expect(result.unchanged).toBe(true);
});

test("a host rule rewrites every shape on its way to being drawn", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        document: { source: { width: number; height: number }; layers: unknown[] };
        addLayer(layer: unknown, options?: { select?: boolean }): void;
        shapeProcessors: Array<(layer: unknown, context: { preview: boolean }) => unknown[] | undefined>;
        renderToImageData(options?: Record<string, unknown>): ImageData;
      };
    };
    const { width, height } = element.editor.document.source;
    const rect = (id: string, x: number, colour: string) => ({
      id,
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      frame: { x: width * x, y: height * 0.3, width: width * 0.2, height: height * 0.4 },
      color: colour,
      fill: colour,
      strokeWidth: 2,
      dash: null,
      cornerRadius: 0,
    });
    element.editor.addLayer(rect("keep", 0.1, "#ff0000"), { select: false });
    element.editor.addLayer(rect("draft", 0.6, "#00ff00"), { select: false });

    // Two narrow rules rather than one that recognises everything.
    element.editor.shapeProcessors.push((layer, context) => {
      const shape = layer as { id: string };
      // A draft mark: on screen while editing, never in the file.
      return shape.id === "draft" && !context.preview ? [] : undefined;
    });
    element.editor.shapeProcessors.push((layer) => {
      const shape = layer as { id: string; color: string; fill: string };
      return shape.id === "keep" ? [{ ...shape, color: "#0000ff", fill: "#0000ff" }] : undefined;
    });

    const read = (region: "crop" | "stage") =>
      element.editor.renderToImageData({ target: { width: 100, height: 100 }, region });
    const colourAt = (pixels: ImageData, fx: number) => {
      const index = (Math.round(pixels.height * 0.5) * pixels.width + Math.round(pixels.width * fx)) * 4;
      return `${pixels.data[index]},${pixels.data[index + 1]},${pixels.data[index + 2]}`;
    };
    const pixels = read("crop");
    const at = (fx: number) => colourAt(pixels, fx);

    return {
      recoloured: at(0.2),
      whereTheDraftWas: at(0.7),
      // The stage is what the viewport draws, so the draft belongs in it.
      draftOnScreen: colourAt(read("stage"), 0.7),
      // The stored document is what undo restores, so it must be untouched.
      stored: element.editor.document.layers.map((layer) => (layer as { id: string; color: string }).color),
    };
  });

  // The rule the host wrote, applied on the way to the file.
  expect(result.recoloured).toBe("0,0,255");
  // And the draft is not in it — whatever the picture is there, it is not green.
  expect(result.whereTheDraftWas).not.toBe("0,255,0");
  // On screen it is, which is the whole point of telling a rule which one it is
  // drawing: "not in the export" and "not on screen" are different requests.
  expect(result.draftOnScreen).toBe("0,255,0");
  // Nothing was rewritten in the document itself.
  expect(result.stored).toEqual(["#ff0000", "#00ff00"]);
});

test("a host preview reaches the screen without reaching the file", async ({ page }) => {
  const seen = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement & {
      editor: {
        document: { source: { width: number; height: number } };
        replacePreview(source: CanvasImageSource, size: { width: number; height: number }): unknown;
        renderToImageData(options?: Record<string, unknown>): ImageData;
      };
    };
    const events: Array<{ host: boolean }> = [];
    element.addEventListener("pixen-preview", (event) => {
      events.push((event as CustomEvent<{ host: boolean }>).detail);
    });

    const middle = (pixels: ImageData) => {
      const index = (Math.round(pixels.height / 2) * pixels.width + Math.round(pixels.width / 2)) * 4;
      return `${pixels.data[index]},${pixels.data[index + 1]},${pixels.data[index + 2]}`;
    };

    // The cheap half of a slow round trip: a flat magenta stand-in.
    const stand = document.createElement("canvas");
    stand.width = 64;
    stand.height = 43;
    const paint = stand.getContext("2d")!;
    paint.fillStyle = "#ff00ff";
    paint.fillRect(0, 0, stand.width, stand.height);
    element.editor.replacePreview(stand, { width: stand.width, height: stand.height });

    // The viewport is the only thing that draws from the proxy, so the screen
    // is read off its own canvas rather than from a fresh render.
    (element as unknown as { viewport: { render(): void } }).viewport.render();
    const canvas = element.shadowRoot!.querySelector("canvas")!;
    const screen = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const magentaOnScreen = (() => {
      for (let i = 0; i < screen.data.length; i += 4) {
        if (screen.data[i] === 255 && screen.data[i + 1] === 0 && screen.data[i + 2] === 255) return true;
      }
      return false;
    })();

    return {
      events,
      magentaOnScreen,
      // An export draws from the source, whatever is standing in on screen.
      inTheFile: middle(element.editor.renderToImageData({ target: { width: 40, height: 40 } })),
      unchanged: element.editor.document.source,
    };
  });

  expect(seen.events).toEqual([{ resourceId: expect.any(String), host: true }]);
  expect(seen.magentaOnScreen).toBe(true);
  // The picture an export would produce is untouched: this is the difference
  // between replacing the preview and replacing the source.
  expect(seen.inTheFile).not.toBe("255,0,255");
});

/**
 * A caption's box is what everything visible about it is drawn from: the
 * selection outline, the handles, the click target, the centre it turns about.
 * It used to be a character count times an average glyph width, so a word of
 * wide letters ran a long way outside its own selection — and the far end of
 * it could not be clicked at all.
 */
test("a wide caption can be selected by its last letter", async ({ page }) => {
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).tool = "text";
  });

  const stage = await page.evaluate(
    () => (document.querySelector("pixen-image-editor") as EditorElement).editor.stageSize,
  );
  const start = await stageToClient(page, { x: stage.width * 0.1, y: stage.height * 0.45 });
  await page.mouse.click(start.x, start.y);
  await page.keyboard.type("WWWWWWWW");
  await page.keyboard.press("Escape");

  const caption = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const layer = element.editor.document.layers[0] as unknown as {
      id: string;
      position: { x: number; y: number };
      fontSize: number;
      fontFamily: string;
      text: string;
    };
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${layer.fontSize}px ${layer.fontFamily}`;
    return {
      id: layer.id,
      position: layer.position,
      fontSize: layer.fontSize,
      measured: context.measureText(layer.text).width,
      // What the old estimate would have said: 0.55 of the type size per character.
      estimated: layer.text.length * layer.fontSize * 0.55,
    };
  });

  // The point of the fixture: these two disagree, so the click below lands
  // inside the letters and outside the box the estimate would have drawn.
  expect(caption.measured).toBeGreaterThan(caption.estimated * 1.2);

  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).tool = "select";
  });
  await page.evaluate((id) => {
    (document.querySelector("pixen-image-editor") as EditorElement).editor.select(id);
  }, caption.id);
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).editor.select(null);
  });

  // The style bar grew a row when the caption appeared, which re-fits the view.
  await settleView(page);
  const lastLetter = await stageToClient(page, {
    x: caption.position.x + caption.measured * 0.95,
    y: caption.position.y + caption.fontSize * 0.5,
  });
  await page.mouse.click(lastLetter.x, lastLetter.y);

  const selected = await page.evaluate(
    () => (document.querySelector("pixen-image-editor") as EditorElement).editor.selectedLayer?.id ?? null,
  );
  expect(selected).toBe(caption.id);
});

/**
 * The undo button says what it will undo, which is the difference between a
 * guess and a decision — and it was saying it in English in every language,
 * because the verb came from the locale and the step came from the engine.
 */
test("the undo button names its step in the editor's own language", async ({ page }) => {
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).setAttribute("locale", "ko");
  });

  const undo = page.locator("pixen-image-editor").locator('[data-action="undo"]');
  const before = (await undo.getAttribute("aria-label")) ?? "";

  // A crop, which is one of the engine's own named steps.
  await page.evaluate(() => {
    (document.querySelector("pixen-image-editor") as EditorElement).editor.dispatch({
      kind: "set-crop",
      rect: { x: 10, y: 10, width: 200, height: 200 },
    });
  });
  await expect(undo).toBeEnabled();

  const after = (await undo.getAttribute("aria-label")) ?? "";
  const korean = await page.evaluate(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    return element.editor.historyState.undoStep;
  });

  expect(korean).toBe("crop");
  expect(after).not.toBe(before);
  // The step, in Korean, and not the engine's English.
  expect(after).toContain("자르기");
  expect(after).not.toContain("Crop");
});

/**
 * A crop usually means "take a piece out of this photograph". It is the wrong
 * meaning for a square cut from a panorama, or for a rotated picture whose
 * corners would otherwise have to be zoomed away — and what lies outside is
 * whatever the background colour and the backdrop put there.
 */
test("a crop can hang off the picture, onto the background behind it", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const editor = element.editor;

    const read = async () => {
      const data = await editor.renderToImageData();
      const at = (x: number, y: number): string => {
        const i = (y * data.width + x) * 4;
        return `${data.data[i]},${data.data[i + 1]},${data.data[i + 2]}`;
      };
      return {
        size: `${data.width}x${data.height}`,
        corner: at(15, 15),
        middle: at(Math.round(data.width / 2), Math.round(data.height / 2)),
      };
    };

    // Refused while the rule holds.
    editor.setCropRect({ x: -300, y: -200, width: 1200, height: 900 });
    const clamped = editor.document.crop;

    editor.setCropWithinImage(false);
    editor.setCropRect({ x: -300, y: -200, width: 1200, height: 900 });
    editor.setOutput({ background: "#ff00ff" });
    const overhanging = editor.document.crop;
    const colourOnly = await read();

    // A backdrop of a deliberately different shape, so `cover` has something to
    // overflow on.
    const canvas = window.document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 200;
    const paint = canvas.getContext("2d")!;
    paint.fillStyle = "#00ffff";
    paint.fillRect(0, 0, 40, 200);
    const registered = await editor.resources.load(await createImageBitmap(canvas));
    editor.setOutput({ backgroundImage: registered.id });
    const withBackdrop = await read();

    // And back home again when the rule is restored.
    editor.setCropWithinImage(true);
    const broughtHome = editor.document.crop;

    return { clamped, overhanging, colourOnly, withBackdrop, broughtHome };
  });

  // The rule held first time.
  expect(outcome.clamped!.x).toBeGreaterThanOrEqual(0);
  // Then it did not.
  expect(outcome.overhanging!.x).toBe(-300);
  expect(outcome.colourOnly.size).toBe("1200x900");
  // The corner is outside the photograph, so it is whatever is behind it.
  expect(outcome.colourOnly.corner).toBe("255,0,255");
  expect(outcome.withBackdrop.corner).toBe("0,255,255");
  // And the middle is the photograph either way.
  expect(outcome.colourOnly.middle).toBe(outcome.withBackdrop.middle);
  expect(outcome.withBackdrop.middle).not.toBe("0,255,255");
  // Restoring the rule brings the crop home rather than leaving the document
  // in a state its own rule forbids.
  expect(outcome.broughtHome!.x).toBeGreaterThanOrEqual(0);
});

/**
 * Taking a blemish out by growing the surroundings over it.
 *
 * It is a layer like everything else, so a repair undoes, moves and survives a
 * round trip through a saved document — the source bitmap is never written to.
 */
test("retouching grows the surroundings over a blemish", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const editor = element.editor;
    const { width, height } = editor.document.source;

    // A dark disc on the sky, which is a smooth background — the case a spot
    // remover is actually for.
    const spot = { x: width * 0.55, y: height * 0.12, r: Math.round(width * 0.03) };
    editor.addLayer({
      id: "blemish",
      type: "ellipse",
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      space: "image",
      frame: { x: spot.x - spot.r, y: spot.y - spot.r, width: spot.r * 2, height: spot.r * 2 },
      color: "#101010",
      fill: "#101010",
      strokeWidth: 0,
      dash: null,
    } as never);

    const readSpot = async () => {
      const data = await editor.renderToImageData();
      const x = Math.round((spot.x / width) * data.width);
      const y = Math.round((spot.y / height) * data.height);
      const i = (y * data.width + x) * 4;
      return { r: data.data[i]!, g: data.data[i + 1]!, b: data.data[i + 2]! };
    };
    const nearby = async () => {
      const data = await editor.renderToImageData();
      const x = Math.round(((spot.x + spot.r * 3) / width) * data.width);
      const y = Math.round((spot.y / height) * data.height);
      const i = (y * data.width + x) * 4;
      return { r: data.data[i]!, g: data.data[i + 1]!, b: data.data[i + 2]! };
    };

    const blemished = await readSpot();
    editor.addLayer({
      id: "heal",
      type: "retouch",
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      space: "image",
      frame: { x: spot.x - spot.r * 1.5, y: spot.y - spot.r * 1.5, width: spot.r * 3, height: spot.r * 3 },
      feather: 0.25,
    } as never);
    const healed = await readSpot();
    const surroundings = await nearby();

    // And it is a layer: undo takes it back.
    editor.undo();
    const undone = await readSpot();

    // After undoing, what was undone is what redo would put back.
    return { blemished, healed, surroundings, undone, step: editor.historyState.redoStep };
  });

  // The blemish was dark and is now near what surrounds it.
  expect(outcome.blemished.r).toBeLessThan(40);
  expect(outcome.healed.r).toBeGreaterThan(40);
  const distance = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  expect(distance(outcome.healed, outcome.surroundings)).toBeLessThan(
    distance(outcome.blemished, outcome.surroundings),
  );

  // A repair is undoable, because the source bitmap was never written to.
  expect(outcome.undone.r).toBeLessThan(40);
  // And the undo button says what it is taking back: adding a repair is not
  // adding an annotation, and the step name is where the difference shows.
  expect(outcome.step).toBe("retouch");
});

/**
 * A poster, a diagram, a caption card, a screenshot annotated onto nothing —
 * all of them begin without a photograph, and every document points at a
 * registered bitmap. So the sheet is made and registered like any other
 * picture, which means every tool, the export and a saved document work on it
 * without knowing it started empty.
 */
test("a document can start on an empty sheet", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("pixen-image-editor") as EditorElement;
    const editor = element.editor;

    const corner = async () => {
      const data = await editor.renderToImageData();
      return [data.data[0]!, data.data[1]!, data.data[2]!, data.data[3]!];
    };

    editor.createBlank({ width: 400, height: 300 });
    const blank = { size: editor.outputSize, name: editor.document.source.name, pixel: await corner() };

    editor.createBlank({ width: 120, height: 90, background: "#ff0000", name: "poster.png" });
    const painted = { size: editor.outputSize, name: editor.document.source.name, pixel: await corner() };

    // It is a document like any other: annotate it, export it, undo it.
    editor.addLayer({
      id: "on_blank",
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      space: "image",
      frame: { x: 10, y: 10, width: 60, height: 40 },
      color: "#0000ff",
      fill: "#0000ff",
      strokeWidth: 0,
      dash: null,
      cornerRadius: 0,
    } as never);
    const written = await editor.export({ format: "image/png" });
    const layers = editor.document.layers.length;
    editor.undo();

    return { blank, painted, written: { bytes: written.bytes, size: `${written.width}x${written.height}` }, layers, afterUndo: editor.document.layers.length };
  });

  // Transparent unless a colour is asked for, which is what blank means.
  expect(outcome.blank.size).toEqual({ width: 400, height: 300 });
  expect(outcome.blank.pixel[3]).toBe(0);
  expect(outcome.blank.name).toBe("blank.png");

  expect(outcome.painted.size).toEqual({ width: 120, height: 90 });
  expect(outcome.painted.pixel).toEqual([255, 0, 0, 255]);
  expect(outcome.painted.name).toBe("poster.png");

  // And everything else works on it.
  expect(outcome.written.size).toBe("120x90");
  expect(outcome.written.bytes).toBeGreaterThan(0);
  expect(outcome.layers).toBe(1);
  expect(outcome.afterUndo).toBe(0);
});
