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
  };
  viewport: { stageToScreen(point: { x: number; y: number }): { x: number; y: number } } | null;
  export(options?: Record<string, unknown>): Promise<{
    blob: Blob;
    width: number;
    height: number;
    bytes: number;
    format: string;
    quality: number;
  }>;
};

async function waitForImage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const element = document.querySelector("pixen-image-editor") as EditorElement | null;
    return Boolean(element?.editor?.ready);
  });
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
    for (const mode of ["blur", "pixelate", "solid"] as const) {
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
  // The adjust panel is the tallest one — nine sliders and nine presets — and it
  // is the one that would push the inspector over the image if the fit ignored
  // how tall the chrome actually is.
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
    };
  });

  // Every adjustment is reachable rather than squashed off the end of a row.
  expect(clear.sliders).toBe(9);
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
