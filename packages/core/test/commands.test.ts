import { describe, expect, it } from "vitest";
import { commands, createDocument, createRectLayer, effectiveCrop, stageSize } from "@pixen/core";

const QUARTER = Math.PI / 2;

function landscape() {
  return createDocument({ resourceId: "res_1", width: 1000, height: 500 });
}

describe("transform commands", () => {
  it("normalises rotation into [0, 2pi)", () => {
    const rotated = commands.rotateQuarterTurns(landscape(), -1);
    expect(rotated.transform.rotation).toBeCloseTo(Math.PI * 1.5);
  });

  it("keeps the selected content selected across a quarter turn", () => {
    // Crop the left third of a landscape image.
    const document = commands.setCrop(landscape(), { x: 0, y: 0, width: 300, height: 500 });
    const rotated = commands.rotateQuarterTurns(document, 1);

    expect(stageSize(rotated)).toEqual({ width: 500, height: 1000 });
    const crop = effectiveCrop(rotated);
    // Rotating clockwise moves the left band of the image to the top of the stage.
    expect(crop.x).toBeCloseTo(0);
    expect(crop.y).toBeCloseTo(0);
    expect(crop.width).toBeCloseTo(500);
    expect(crop.height).toBeCloseTo(300);
  });

  it("inverts a locked aspect ratio on a quarter turn", () => {
    const document = commands.setAspectRatio(landscape(), 16 / 9);
    const rotated = commands.rotateQuarterTurns(document, 1);
    expect(rotated.aspectRatio).toBeCloseTo(9 / 16);
    const crop = effectiveCrop(rotated);
    expect(crop.width / crop.height).toBeCloseTo(9 / 16, 4);
  });

  it("keeps a locked ratio through a flip", () => {
    const document = commands.setAspectRatio(landscape(), 1);
    const flipped = commands.flip(document, "x");
    expect(flipped.aspectRatio).toBe(1);
    expect(effectiveCrop(flipped).width).toBeCloseTo(effectiveCrop(flipped).height);
  });

  it("mirrors the crop position on a flip", () => {
    const document = commands.setCrop(landscape(), { x: 0, y: 0, width: 200, height: 200 });
    const flipped = commands.flip(document, "x");
    expect(effectiveCrop(flipped).x).toBeCloseTo(800);
  });

  it("returns to the original crop after four quarter turns", () => {
    const document = commands.setCrop(landscape(), { x: 120, y: 40, width: 300, height: 200 });
    let rotated = document;
    for (let i = 0; i < 4; i += 1) rotated = commands.rotateQuarterTurns(rotated, 1);
    const crop = effectiveCrop(rotated);
    expect(crop.x).toBeCloseTo(120, 6);
    expect(crop.y).toBeCloseTo(40, 6);
    expect(crop.width).toBeCloseTo(300, 6);
    expect(crop.height).toBeCloseTo(200, 6);
  });

  it("never lets a crop escape the stage after a free rotation", () => {
    const document = commands.setCrop(landscape(), { x: 0, y: 0, width: 1000, height: 500 });
    const rotated = commands.rotateBy(document, 0.4);
    const stage = stageSize(rotated);
    const crop = effectiveCrop(rotated);
    expect(crop.x).toBeGreaterThanOrEqual(-1e-6);
    expect(crop.y).toBeGreaterThanOrEqual(-1e-6);
    expect(crop.x + crop.width).toBeLessThanOrEqual(stage.width + 1e-6);
    expect(crop.y + crop.height).toBeLessThanOrEqual(stage.height + 1e-6);
  });
});

describe("crop commands", () => {
  it("drags a handle within the stage", () => {
    const document = commands.setCrop(landscape(), { x: 100, y: 100, width: 400, height: 200 });
    const dragged = commands.dragCropHandle(document, "top-left", { x: -50, y: -50 });
    const crop = effectiveCrop(dragged);
    expect(crop.x).toBeCloseTo(0);
    expect(crop.y).toBeCloseTo(0);
  });

  it("clears the crop", () => {
    const document = commands.setCrop(landscape(), { x: 10, y: 10, width: 10, height: 10 });
    expect(commands.setCrop(document, null).crop).toBeNull();
  });
});

describe("layer commands", () => {
  it("adds, reorders and removes layers", () => {
    const a = createRectLayer({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRectLayer({ x: 20, y: 20, width: 10, height: 10 });
    let document = commands.addLayer(landscape(), a);
    document = commands.addLayer(document, b);
    expect(document.layers.map((l) => l.id)).toEqual([a.id, b.id]);

    document = commands.reorderLayer(document, b.id, 0);
    expect(document.layers.map((l) => l.id)).toEqual([b.id, a.id]);

    document = commands.removeLayer(document, b.id);
    expect(document.layers.map((l) => l.id)).toEqual([a.id]);
  });

  it("clamps a reorder index instead of throwing", () => {
    const a = createRectLayer({ x: 0, y: 0, width: 10, height: 10 });
    const document = commands.addLayer(landscape(), a);
    expect(commands.reorderLayer(document, a.id, 99).layers[0]!.id).toBe(a.id);
  });

  it("moves a layer in image space", () => {
    const layer = createRectLayer({ x: 10, y: 10, width: 100, height: 100 });
    const document = commands.moveLayerBy(commands.addLayer(landscape(), layer), layer.id, { x: 5, y: -5 });
    expect(document.layers[0]).toMatchObject({ frame: { x: 15, y: 5 } });
  });

  it("keeps layers overlapping the image when clamping", () => {
    const layer = createRectLayer({ x: -500, y: -500, width: 100, height: 100 });
    const document = commands.clampLayersToImage(commands.addLayer(landscape(), layer));
    expect(document.layers[0]).toMatchObject({ frame: { x: 0, y: 0 } });
  });
});

describe("resetEdits", () => {
  it("drops edits but keeps the source and export preferences", () => {
    let document = commands.setCrop(landscape(), { x: 1, y: 1, width: 10, height: 10 });
    document = commands.rotateQuarterTurns(document, 1);
    document = commands.setOutput(document, { format: "image/webp", quality: 0.6 });
    document = commands.addLayer(document, createRectLayer({ x: 0, y: 0, width: 5, height: 5 }));

    const reset = commands.resetEdits(document);
    expect(reset.crop).toBeNull();
    expect(reset.layers).toEqual([]);
    expect(reset.transform).toEqual({ rotation: 0, flipX: false, flipY: false });
    expect(reset.output.format).toBe("image/webp");
    expect(reset.source.resourceId).toBe("res_1");
  });
});
