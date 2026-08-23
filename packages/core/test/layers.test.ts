import { describe, expect, it } from "vitest";
import {
  createImageLayer,
  createRedactLayer,
  createWatermarkLayer,
  DEFAULT_REDACTION_MODE,
  DEFAULT_REDACTION_STRENGTH,
  DEFAULT_WATERMARK_MARGIN,
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_POSITION,
  DEFAULT_WATERMARK_SCALE,
  imageLayerOps,
  createTextLayer,
  estimateTextWidth,
  layerBounds,
  layerRotationCentre,
  redactLayerOps,
  translateLayer,
  watermarkFrame,
  type DrawOp,
  type ImageLayer,
  type TextLayer,
  type TextMeasurer,
} from "@pixen/core";

const frame = { x: 10, y: 20, width: 100, height: 50 };
const bitmap = { width: 64, height: 32 } as unknown as CanvasImageSource;

describe("image layers", () => {
  it("references its bitmap by id, so the document stays JSON", () => {
    const layer = createImageLayer("res_logo", frame);
    expect(layer).toMatchObject({ type: "image", resourceId: "res_logo", frame, repeat: false });
    expect(JSON.parse(JSON.stringify(layer))).toEqual(layer);
  });

  it("reports its frame as its bounds, and moves with the rest", () => {
    const layer = createImageLayer("res_logo", frame);
    expect(layerBounds(layer)).toEqual(frame);
    expect(translateLayer(layer, 5, -5)).toMatchObject({ frame: { x: 15, y: 15 } });
  });

  it("draws stretched into its frame", () => {
    const ops = imageLayerOps(createImageLayer("res_logo", frame), bitmap);
    expect(ops).toEqual([{ op: "layer-image", source: bitmap, frame, repeat: false }]);
  });

  it("tiles when asked", () => {
    const ops = imageLayerOps(createImageLayer("res_logo", frame, { repeat: true }), bitmap);
    expect(ops[0]).toMatchObject({ repeat: true });
  });

  it("renders nothing when the bitmap is gone, rather than failing", () => {
    // A saved document can outlive the sticker it referenced.
    expect(imageLayerOps(createImageLayer("res_missing", frame), undefined)).toEqual([]);
  });
});

describe("redaction layers", () => {
  it("defaults to the mode that actually removes pixels", () => {
    const layer = createRedactLayer(frame);
    expect(layer.mode).toBe(DEFAULT_REDACTION_MODE);
    expect(layer.mode).toBe("solid");
    expect(layer.strength).toBe(DEFAULT_REDACTION_STRENGTH);
  });

  it("emits one operation, whatever the mode", () => {
    for (const mode of ["solid", "blur", "pixelate"] as const) {
      const ops = redactLayerOps(createRedactLayer(frame, { mode }), 1000);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ op: "obscure", mode, frame });
    }
  });

  it("scales strength with the image, so a preview and an export match", () => {
    const layer = createRedactLayer(frame, { mode: "blur", strength: 0.02 });
    const small = redactLayerOps(layer, 500)[0] as Extract<DrawOp, { op: "obscure" }>;
    const large = redactLayerOps(layer, 4000)[0] as Extract<DrawOp, { op: "obscure" }>;
    expect(small.strength).toBeCloseTo(10);
    expect(large.strength).toBeCloseTo(80);
  });

  it("never asks for a strength below one device unit", () => {
    const op = redactLayerOps(createRedactLayer(frame, { mode: "blur", strength: 0.0001 }), 100)[0];
    expect(op).toMatchObject({ strength: 1 });
  });

  it("carries the fill colour, which is also the fallback", () => {
    const op = redactLayerOps(createRedactLayer(frame, { mode: "pixelate", colour: "#123456" }), 1000)[0];
    expect(op).toMatchObject({ colour: "#123456" });
  });
});

describe("watermarks", () => {
  const image = { width: 1000, height: 500 };
  const mark = { width: 200, height: 100 };
  const options = { resourceId: "res_mark", size: mark };

  it("documents its defaults, since a host reads them before overriding one", () => {
    expect(DEFAULT_WATERMARK_POSITION).toBe("bottom-right");
    expect(DEFAULT_WATERMARK_SCALE).toBeGreaterThan(0);
    expect(DEFAULT_WATERMARK_SCALE).toBeLessThan(1);
    expect(DEFAULT_WATERMARK_MARGIN).toBeLessThan(DEFAULT_WATERMARK_SCALE);
    expect(DEFAULT_WATERMARK_OPACITY).toBeLessThan(1);
  });

  it("scales and insets by the documented defaults", () => {
    const placed = watermarkFrame(image, options);
    const longest = Math.max(image.width, image.height);
    expect(placed.width).toBeCloseTo(DEFAULT_WATERMARK_SCALE * longest);
    expect(image.width - (placed.x + placed.width)).toBeCloseTo(DEFAULT_WATERMARK_MARGIN * longest);
  });

  it("sits in the bottom-right by default, inside the margin", () => {
    const placed = watermarkFrame(image, options);
    expect(placed.x + placed.width).toBeLessThan(image.width);
    expect(placed.y + placed.height).toBeLessThan(image.height);
    expect(placed.x).toBeGreaterThan(image.width / 2);
  });

  it("keeps the bitmap's aspect ratio", () => {
    const placed = watermarkFrame(image, options);
    expect(placed.width / placed.height).toBeCloseTo(mark.width / mark.height, 5);
  });

  it("scales against the longest edge, so portrait and landscape agree", () => {
    const landscape = watermarkFrame({ width: 1000, height: 500 }, options);
    const portrait = watermarkFrame({ width: 500, height: 1000 }, options);
    expect(landscape.width).toBeCloseTo(portrait.width);
  });

  it("places every corner and edge where its name says", () => {
    const at = (position: Parameters<typeof watermarkFrame>[1]["position"]) =>
      watermarkFrame(image, { ...options, position });

    expect(at("top-left")).toMatchObject({ x: 30, y: 30 });
    expect(at("top-right").x).toBeGreaterThan(at("top-left").x);
    expect(at("bottom-left").y).toBeGreaterThan(at("top-left").y);
    expect(at("centre").x).toBeCloseTo((image.width - at("centre").width) / 2);
    expect(at("top").x).toBeCloseTo(at("centre").x);
    expect(at("left").y).toBeCloseTo(at("centre").y);
  });

  it("covers the whole image when tiling", () => {
    expect(watermarkFrame(image, { ...options, position: "tile" })).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    });
  });

  it("builds a tiling image layer, semi-transparent by default", () => {
    const layer: ImageLayer = createWatermarkLayer(image, { ...options, position: "tile" });
    expect(layer).toMatchObject({ type: "image", repeat: true, opacity: DEFAULT_WATERMARK_OPACITY });
    expect(layer.name).toBe("watermark");
  });

  it("respects an explicit opacity and scale", () => {
    const layer = createWatermarkLayer(image, { ...options, opacity: 1, scale: 0.5 });
    expect(layer.opacity).toBe(1);
    expect(layer.frame.width).toBeCloseTo(500);
  });
});

/**
 * A caption's box used to be a character count times an average glyph width,
 * which is the same number for `iiii` and `WWWW` and four times wrong for one
 * of them. Everything that draws a selection, places a handle, hit-tests a
 * click or turns a layer asked for that box, so the letters sat outside it.
 */
describe("a caption's bounding box", () => {
  const wide: TextMeasurer = (text, font) => text.length * Number.parseFloat(font) * 1.2;

  const caption = (text: string, extra: Partial<TextLayer> = {}) =>
    ({ ...createTextLayer({ x: 10, y: 20 }, text, { fontSize: 50, ...extra }) }) as TextLayer;

  it("is the width the measurer gives, not a guess from the character count", () => {
    expect(layerBounds(caption("WWWW"), wide).width).toBe(4 * 50 * 1.2);
  });

  it("differs between two strings of the same length", () => {
    const narrow: TextMeasurer = (text) => text.replace(/[^W]/g, "").length * 40 + text.length * 4;
    expect(layerBounds(caption("WWWW"), narrow).width).not.toBe(layerBounds(caption("iiii"), narrow).width);
  });

  it("is the widest line, not the wrapping width, when the text is narrower than its limit", () => {
    const measure: TextMeasurer = (text) => text.length * 10;
    expect(layerBounds(caption("ab", { maxWidth: 500 }), measure).width).toBe(20);
  });

  it("is the same box the renderer turns the layer about", () => {
    const layer = caption("WWWW");
    expect(layerRotationCentre(layer, wide)).toEqual({
      x: layer.position.x + layerBounds(layer, wide).width / 2,
      y: layer.position.y + layerBounds(layer, wide).height / 2,
    });
  });

  it("falls back to the estimate when nothing can measure", () => {
    expect(layerBounds(caption("WWWW")).width).toBeCloseTo(estimateTextWidth("WWWW", "50px sans-serif"), 5);
  });
});
