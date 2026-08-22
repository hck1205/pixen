import { describe, expect, it } from "vitest";
import {
  createEllipseLayer,
  createImageLayer,
  createPathLayer,
  createRectLayer,
  createTextLayer,
  layerBounds,
  layerHandlePosition,
  normaliseAngle,
  resizeLayer,
  rotateLayer,
  ROTATION_SNAP,
  scaleLayerToBounds,
  createArrowLayer,
} from "@pixen/core";

const frame = { x: 100, y: 100, width: 200, height: 100 };

describe("layerHandlePosition", () => {
  it("puts the eight resize handles on the bounding box", () => {
    const layer = createRectLayer(frame);
    expect(layerHandlePosition(layer, "top-left")).toEqual({ x: 100, y: 100 });
    expect(layerHandlePosition(layer, "bottom-right")).toEqual({ x: 300, y: 200 });
    expect(layerHandlePosition(layer, "top")).toEqual({ x: 200, y: 100 });
    expect(layerHandlePosition(layer, "left")).toEqual({ x: 100, y: 150 });
  });

  it("puts the rotate handle clear of the top edge", () => {
    const handle = layerHandlePosition(createRectLayer(frame), "rotate");
    expect(handle.x).toBeCloseTo(200);
    expect(handle.y).toBeLessThan(100);
  });

  it("turns the handles with the layer, so they stay on its corners", () => {
    const layer = createRectLayer(frame, { rotation: Math.PI / 2 });
    const corner = layerHandlePosition(layer, "top-left");
    // A quarter turn about the centre (200, 150) sends (100, 100) to (250, 50).
    expect(corner.x).toBeCloseTo(250);
    expect(corner.y).toBeCloseTo(50);
  });
});

describe("scaleLayerToBounds", () => {
  const from = { x: 0, y: 0, width: 100, height: 100 };
  const to = { x: 50, y: 50, width: 200, height: 50 };

  it("moves a rect onto the new box", () => {
    const scaled = scaleLayerToBounds(createRectLayer(from), from, to);
    expect(layerBounds(scaled)).toEqual(to);
  });

  it("carries every point of a path along", () => {
    const layer = createPathLayer([
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 0 },
    ]);
    const scaled = scaleLayerToBounds(layer, from, to);
    expect(scaled.type).toBe("path");
    if (scaled.type !== "path") return;
    expect(scaled.points[0]).toEqual({ x: 50, y: 50 });
    expect(scaled.points[1]).toEqual({ x: 150, y: 100 });
    expect(scaled.points[2]).toEqual({ x: 250, y: 50 });
  });

  it("takes an arrow's endpoints with it", () => {
    const layer = createArrowLayer({ x: 0, y: 0 }, { x: 100, y: 100 });
    const scaled = scaleLayerToBounds(layer, from, to);
    expect(scaled.type).toBe("line");
    if (scaled.type !== "line") return;
    expect(scaled.from).toEqual({ x: 50, y: 50 });
    expect(scaled.to).toEqual({ x: 250, y: 100 });
  });

  it("scales type size by height and the wrapping column by width", () => {
    const layer = createTextLayer({ x: 0, y: 0 }, "hello", { fontSize: 40, maxWidth: 100 });
    const scaled = scaleLayerToBounds(layer, from, to);
    expect(scaled.type).toBe("text");
    if (scaled.type !== "text") return;
    expect(scaled.fontSize).toBeCloseTo(20);
    expect(scaled.maxWidth).toBeCloseTo(200);
  });

  it("translates rather than scaling an axis with no extent", () => {
    const flat = { x: 0, y: 0, width: 100, height: 0 };
    const layer = createArrowLayer({ x: 0, y: 0 }, { x: 100, y: 0 });
    const scaled = scaleLayerToBounds(layer, flat, { ...flat, x: 10, y: 20 });
    expect(scaled.type).toBe("line");
    if (scaled.type !== "line") return;
    expect(scaled.from).toEqual({ x: 10, y: 20 });
    expect(scaled.to).toEqual({ x: 110, y: 20 });
  });
});

describe("resizeLayer", () => {
  it("pins the opposite corner", () => {
    const layer = createRectLayer(frame);
    const resized = resizeLayer(layer, "bottom-right", { x: 400, y: 400 });
    expect(layerBounds(resized)).toEqual({ x: 100, y: 100, width: 300, height: 300 });
  });

  it("pulls the near edge without moving the far one", () => {
    const resized = resizeLayer(createRectLayer(frame), "left", { x: 150, y: 999 });
    expect(layerBounds(resized)).toEqual({ x: 150, y: 100, width: 150, height: 100 });
  });

  it("refuses to collapse a layer past the minimum", () => {
    const resized = resizeLayer(createRectLayer(frame), "right", { x: -500, y: 0 }, { minSize: 10 });
    expect(layerBounds(resized).width).toBe(10);
  });

  it("keeps a locked ratio on a corner drag", () => {
    const layer = createImageLayer("res_1", { x: 0, y: 0, width: 100, height: 100 });
    const resized = resizeLayer(layer, "bottom-right", { x: 300, y: 140 }, { aspectRatio: 2 });
    const bounds = layerBounds(resized);
    expect(bounds.width / bounds.height).toBeCloseTo(2);
  });

  it("keeps the anchor corner still while a rotated layer grows", () => {
    const layer = createEllipseLayer(frame, { rotation: Math.PI / 6 });
    const anchorBefore = layerHandlePosition(layer, "top-left");
    const resized = resizeLayer(layer, "bottom-right", { x: 500, y: 400 });
    const anchorAfter = layerHandlePosition(resized, "top-left");

    // Without the correction the whole layer drifts as it grows, which is the
    // bug a rotated resize always has.
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y);
  });

  it("honours the minimum on the axis the ratio derives, not just the dragged one", () => {
    const layer = createImageLayer("res_1", { x: 0, y: 0, width: 100, height: 10 });
    // A 10:1 layer collapsed to the far side with a floor of 20. The floor used
    // to be applied before the ratio derived the height, so the height came out
    // at 2 — a fifth of the minimum, on a layer that asked for one.
    const bounds = layerBounds(resizeLayer(layer, "right", { x: -500, y: 0 }, { minSize: 20, aspectRatio: 10 }));
    expect(bounds.width).toBeGreaterThanOrEqual(20);
    expect(bounds.height).toBeGreaterThanOrEqual(20);
    expect(bounds.width / bounds.height).toBeCloseTo(10);
  });

  it("keeps the opposite edge's midpoint still on a ratio-locked side drag", () => {
    const layer = createImageLayer("res_1", { x: 0, y: 0, width: 100, height: 100 });
    const before = layerHandlePosition(layer, "left");
    const resized = resizeLayer(layer, "right", { x: 300, y: 0 }, { aspectRatio: 1 });
    const after = layerHandlePosition(resized, "left");

    // Widening a square used to make it grow downwards as well as rightwards,
    // because the derived height was pinned to the top edge — so a layer walked
    // down the picture over a few drags. The vertical axis is free here: it
    // belongs to neither the handle nor the edge opposite it, and grows about
    // its own centre.
    expect(layerBounds(resized)).toMatchObject({ width: 300, height: 300 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("keeps it still for a rotated layer too, which is the same rule", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 100, height: 100 }, { rotation: Math.PI / 6 });
    const before = layerHandlePosition(layer, "left");
    const after = layerHandlePosition(resizeLayer(layer, "right", { x: 300, y: 0 }, { aspectRatio: 1 }), "left");
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("grows a rotated layer along its own axes, not the image's", () => {
    const layer = createRectLayer(frame, { rotation: Math.PI / 2 });
    // Under a quarter turn, dragging the "right" handle moves the pointer down
    // the image, so the layer's own width is what changes.
    const resized = resizeLayer(layer, "right", { x: 200, y: 400 });
    expect(layerBounds(resized).width).toBeGreaterThan(frame.width);
    expect(layerBounds(resized).height).toBeCloseTo(frame.height);
  });
});

describe("rotateLayer", () => {
  const layer = createRectLayer({ x: 0, y: 0, width: 100, height: 100 });

  it("is neutral when the pointer is straight above the centre", () => {
    expect(rotateLayer(layer, { x: 50, y: -100 }).rotation).toBeCloseTo(0);
  });

  it("follows the pointer round", () => {
    expect(rotateLayer(layer, { x: 200, y: 50 }).rotation).toBeCloseTo(Math.PI / 2);
    expect(rotateLayer(layer, { x: 50, y: 200 }).rotation).toBeCloseTo(Math.PI);
  });

  it("snaps to a multiple when asked", () => {
    const rotated = rotateLayer(layer, { x: 200, y: 46 }, { snap: ROTATION_SNAP });
    expect(rotated.rotation % ROTATION_SNAP).toBeCloseTo(0);
  });
});

describe("normaliseAngle", () => {
  it("folds a wound-up angle back into one turn", () => {
    expect(normaliseAngle(Math.PI * 4 + 0.5)).toBeCloseTo(0.5);
    expect(normaliseAngle(-Math.PI * 4 - 0.5)).toBeCloseTo(-0.5);
    expect(normaliseAngle(Math.PI)).toBeCloseTo(Math.PI);
  });
});
