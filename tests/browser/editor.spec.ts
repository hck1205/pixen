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
