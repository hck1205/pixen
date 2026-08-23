import { describe, expect, it } from "vitest";
import {
  applyToPoint,
  applyAdjustmentsToImageData,
  createDocument,
  createImageLayer,
  ADJUSTMENT_PRESETS,
  clampAdjustments,
  DEFAULT_ADJUSTMENTS,
  matchingPreset,
  presetAdjustments,
  type Adjustments,
  createRectLayer,
  createScene,
  cssFilter,
  commands,
} from "@pixen/core";

const source = { width: 1000, height: 500 } as unknown as CanvasImageSource;

/** A full adjustment set, so a test only names the values it cares about. */
function adjust(overrides: Partial<Adjustments> = {}): Adjustments {
  return { ...DEFAULT_ADJUSTMENTS, ...overrides };
}

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

  it("says where the picture goes, whatever bitmap is standing in for it", () => {
    // The scene names the picture's own size and the executor stretches
    // whatever it is given into that box. A proxy needs no arithmetic here, and
    // the size is not the proxy's — a redaction's strength is a fraction of it.
    const scene = createScene(document(), { source }, { region: "stage" });
    expect(scene.image.size).toEqual({ width: 1000, height: 500 });

    const corner = applyToPoint(scene.image.matrix, { x: 1000, y: 500 });
    expect(corner.x).toBeCloseTo(1000);
    expect(corner.y).toBeCloseTo(500);
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
    expect(cssFilter(adjust())).toBe("");
  });

  it("maps -1..1 onto CSS factors", () => {
    expect(cssFilter(adjust({ brightness: 0.2, contrast: -0.5, saturation: 1 }))).toBe(
      "brightness(1.2) contrast(0.5) saturate(2)",
    );
  });

  it("clamps absurd values", () => {
    expect(cssFilter(adjust({ brightness: 99, contrast: -99 }))).toBe("brightness(4) contrast(0)");
  });

  it("reads exposure in stops, so one stop is a doubling", () => {
    expect(cssFilter(adjust({ exposure: 1 }))).toBe("brightness(2)");
    expect(cssFilter(adjust({ exposure: -1 }))).toBe("brightness(0.5)");
  });

  it("emits the tonal filters in the order they are applied", () => {
    expect(cssFilter(adjust({ hue: 30, grayscale: 0.5, sepia: 0.25, invert: 1 }))).toBe(
      "hue-rotate(30deg) grayscale(0.5) sepia(0.25) invert(1)",
    );
  });

  it("leaves the vignette out, because it is drawn rather than filtered", () => {
    expect(cssFilter(adjust({ vignette: 1 }))).toBe("");
  });
});

describe("pixel adjustment fallback", () => {
  const pixel = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

  it("brightens every channel", () => {
    const data = pixel(100, 100, 100);
    applyAdjustmentsToImageData(data, adjust({ brightness: 0.5 }));
    expect(data[0]).toBe(150);
  });

  it("doubles for a stop of exposure", () => {
    const data = pixel(60, 60, 60);
    applyAdjustmentsToImageData(data, adjust({ exposure: 1 }));
    expect(data[0]).toBe(120);
  });

  it("drains colour at full grayscale", () => {
    const data = pixel(200, 40, 40);
    applyAdjustmentsToImageData(data, adjust({ grayscale: 1 }));
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });

  it("inverts", () => {
    const data = pixel(0, 40, 255);
    applyAdjustmentsToImageData(data, adjust({ invert: 1 }));
    expect([data[0], data[1], data[2]]).toEqual([255, 215, 0]);
  });

  it("warms towards the sepia matrix", () => {
    const data = pixel(120, 120, 120);
    applyAdjustmentsToImageData(data, adjust({ sepia: 1 }));
    // The specification's matrix pushes red above blue on a neutral grey.
    expect(data[0]!).toBeGreaterThan(data[2]!);
  });

  it("leaves pixels untouched when nothing is adjusted", () => {
    const data = pixel(10, 20, 30);
    applyAdjustmentsToImageData(data, adjust());
    expect([...data]).toEqual([10, 20, 30, 255]);
  });

  it("ignores the vignette, which the chain does not carry either", () => {
    const data = pixel(10, 20, 30);
    applyAdjustmentsToImageData(data, adjust({ vignette: 1 }));
    expect([...data]).toEqual([10, 20, 30, 255]);
  });
});

describe("presets", () => {
  it("stand for ordinary adjustment values", () => {
    const vivid = ADJUSTMENT_PRESETS.find((preset) => preset.id === "vivid")!;
    expect(presetAdjustments(vivid)).toMatchObject({ saturation: 0.35, contrast: 0.18, hue: 0 });
  });

  it("recognise a document that matches one exactly", () => {
    const mono = ADJUSTMENT_PRESETS.find((preset) => preset.id === "mono")!;
    expect(matchingPreset(presetAdjustments(mono))?.id).toBe("mono");
  });

  it("call neutral adjustments the original", () => {
    expect(matchingPreset(adjust())?.id).toBe("original");
  });

  it("stop claiming a preset once a slider has moved", () => {
    const mono = ADJUSTMENT_PRESETS.find((preset) => preset.id === "mono")!;
    expect(matchingPreset({ ...presetAdjustments(mono), exposure: 0.3 })).toBeNull();
  });
});

describe("clampAdjustments", () => {
  it("holds every value inside its own range", () => {
    const clamped = clampAdjustments(adjust({ exposure: 99, grayscale: -5, hue: 900 }));
    expect(clamped.exposure).toBe(2);
    expect(clamped.grayscale).toBe(0);
    expect(clamped.hue).toBe(180);
  });

  it("replaces a value that is not a number with the neutral one", () => {
    expect(clampAdjustments({ ...adjust(), contrast: Number.NaN }).contrast).toBe(0);
  });
});
