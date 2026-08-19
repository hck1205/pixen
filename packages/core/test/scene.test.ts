import { describe, expect, it } from "vitest";
import {
  applyToPoint,
  applyAdjustmentsToImageData,
  createDocument,
  createImageLayer,
  createRectLayer,
  createScene,
  cssFilter,
  commands,
} from "@pixen/core";

const source = { width: 1000, height: 500 } as unknown as CanvasImageSource;

function document() {
  return createDocument({ resourceId: "res_1", width: 1000, height: 500 });
}

describe("createScene", () => {
  it("maps the crop onto the export target", () => {
    const doc = commands.setCrop(document(), { x: 200, y: 100, width: 400, height: 200 });
    const scene = createScene(doc, { source }, { region: "crop" });

    expect(scene.target).toEqual({ width: 400, height: 200 });
    const topLeft = applyToPoint(scene.image.matrix, { x: 200, y: 100 });
    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(0);
  });

  it("undoes the preview downscale so a proxy bitmap lands in the same place", () => {
    const doc = document();
    const full = createScene(doc, { source, sourceScale: 1 }, { region: "stage" });
    const preview = createScene(doc, { source, sourceScale: 0.25 }, { region: "stage" });

    // The preview bitmap is a quarter the size, so its own bottom-right corner
    // must still land on the stage's bottom-right corner.
    const fullCorner = applyToPoint(full.image.matrix, { x: 1000, y: 500 });
    const previewCorner = applyToPoint(preview.image.matrix, { x: 250, y: 125 });
    expect(previewCorner.x).toBeCloseTo(fullCorner.x);
    expect(previewCorner.y).toBeCloseTo(fullCorner.y);
  });

  it("renders the whole stage in stage region, including outside the crop", () => {
    const doc = commands.setCrop(document(), { x: 400, y: 200, width: 100, height: 100 });
    const scene = createScene(doc, { source }, { region: "stage" });
    expect(scene.sourceRect).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });

  it("scales output when the document asks for a resize", () => {
    const doc = commands.setOutput(document(), { width: 500, height: 250 });
    const scene = createScene(doc, { source });
    expect(scene.target).toEqual({ width: 500, height: 250 });
    expect(scene.scale).toBeCloseTo(0.5);
  });

  it("skips hidden layers", () => {
    let doc = commands.addLayer(document(), createRectLayer({ x: 0, y: 0, width: 10, height: 10 }));
    doc = commands.addLayer(doc, createRectLayer({ x: 0, y: 0, width: 10, height: 10 }, { visible: false }));
    expect(createScene(doc, { source }).layers).toHaveLength(1);
  });

  it("resolves the bitmap an image layer refers to", () => {
    const bitmap = { width: 64, height: 64 } as unknown as CanvasImageSource;
    const layer = createImageLayer("res_mark", { x: 0, y: 0, width: 100, height: 100 });
    const doc = commands.addLayer(document(), layer);

    const resolved = createScene(doc, { source, resolveResource: () => bitmap });
    expect(resolved.layers[0]!.resource).toBe(bitmap);
  });

  it("leaves an image layer without pixels when its resource is gone", () => {
    const layer = createImageLayer("res_missing", { x: 0, y: 0, width: 100, height: 100 });
    const doc = commands.addLayer(document(), layer);

    // A document can outlive the sticker it referenced; the renderer draws
    // nothing rather than failing mid-frame.
    expect(createScene(doc, { source, resolveResource: () => null }).layers[0]!.resource).toBeUndefined();
    expect(createScene(doc, { source }).layers[0]!.resource).toBeUndefined();
  });

  it("passes layer coordinates through the same matrix as the image", () => {
    const layer = createRectLayer({ x: 100, y: 100, width: 50, height: 50 });
    const doc = commands.addLayer(commands.rotateQuarterTurns(document(), 1), layer);
    const scene = createScene(doc, { source });
    const node = scene.layers[0]!;
    expect(node.matrix).toEqual(scene.image.matrix);
  });
});

describe("cssFilter", () => {
  it("is empty when nothing is adjusted", () => {
    expect(cssFilter({ brightness: 0, contrast: 0, saturation: 0 })).toBe("");
  });

  it("maps -1..1 onto CSS factors", () => {
    expect(cssFilter({ brightness: 0.2, contrast: -0.5, saturation: 1 })).toBe(
      "brightness(1.2) contrast(0.5) saturate(2)",
    );
  });

  it("clamps absurd values", () => {
    expect(cssFilter({ brightness: 99, contrast: -99, saturation: 0 })).toBe("brightness(4) contrast(0)");
  });
});

describe("pixel adjustment fallback", () => {
  it("brightens every channel", () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255]);
    applyAdjustmentsToImageData(data, { brightness: 0.5, contrast: 0, saturation: 0 });
    expect(data[0]).toBe(150);
    expect(data[3]).toBe(255);
  });

  it("drives saturation to grey at -1", () => {
    const data = new Uint8ClampedArray([200, 50, 100, 255]);
    applyAdjustmentsToImageData(data, { brightness: 0, contrast: 0, saturation: -1 });
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });

  it("leaves pixels untouched when nothing is adjusted", () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4]);
    applyAdjustmentsToImageData(data, { brightness: 0, contrast: 0, saturation: 0 });
    expect([...data]).toEqual([1, 2, 3, 4]);
  });
});
