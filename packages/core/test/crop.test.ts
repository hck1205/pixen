import { describe, expect, it } from "vitest";
import { applyAspectRatio, constrainRect, moveCrop, resizeCrop, handlePosition } from "@pixen/core";

const bounds = { x: 0, y: 0, width: 1000, height: 500 };

describe("resizeCrop", () => {
  const crop = { x: 200, y: 100, width: 400, height: 200 };

  it("pins the opposite edge when dragging a side handle", () => {
    const next = resizeCrop(crop, "left", { x: 100, y: 250 }, { bounds });
    expect(next.x).toBeCloseTo(100);
    expect(next.x + next.width).toBeCloseTo(600);
    expect(next.y).toBeCloseTo(100);
    expect(next.height).toBeCloseTo(200);
  });

  it("never lets an edge cross past the minimum size", () => {
    const next = resizeCrop(crop, "right", { x: 0, y: 250 }, { bounds, minSize: 32 });
    expect(next.width).toBeGreaterThanOrEqual(32);
    expect(next.x).toBeCloseTo(200);
  });

  it("keeps the crop inside the stage", () => {
    const next = resizeCrop(crop, "bottom-right", { x: 5000, y: 5000 }, { bounds });
    expect(next.x + next.width).toBeLessThanOrEqual(bounds.width + 1e-6);
    expect(next.y + next.height).toBeLessThanOrEqual(bounds.height + 1e-6);
  });

  it("holds the locked ratio while dragging a corner", () => {
    const next = resizeCrop(crop, "bottom-right", { x: 900, y: 480 }, { bounds, aspectRatio: 1 });
    expect(next.width / next.height).toBeCloseTo(1, 5);
    expect(next.x).toBeCloseTo(200);
    expect(next.y).toBeCloseTo(100);
  });

  it("holds the locked ratio while dragging a side, anchored on the pinned edge", () => {
    const next = resizeCrop(crop, "right", { x: 800, y: 250 }, { bounds, aspectRatio: 2 });
    expect(next.width / next.height).toBeCloseTo(2, 5);
    expect(next.x).toBeCloseTo(200);
  });

  it("shrinks rather than overflow when the ratio cannot fit", () => {
    const next = resizeCrop(crop, "top-left", { x: 0, y: 0 }, { bounds, aspectRatio: 3 });
    expect(next.width / next.height).toBeCloseTo(3, 5);
    expect(next.x).toBeGreaterThanOrEqual(-1e-6);
    expect(next.y).toBeGreaterThanOrEqual(-1e-6);
    expect(next.x + next.width).toBeLessThanOrEqual(bounds.width + 1e-6);
  });
});

describe("moveCrop", () => {
  it("slides the crop and stops at the edge", () => {
    const crop = { x: 900, y: 400, width: 200, height: 200 };
    const next = moveCrop(crop, { x: 500, y: 500 }, bounds);
    expect(next.x + next.width).toBeCloseTo(1000);
    expect(next.y + next.height).toBeCloseTo(500);
  });
});

describe("applyAspectRatio", () => {
  it("keeps the crop centred while changing shape", () => {
    const crop = { x: 200, y: 100, width: 400, height: 200 };
    const next = applyAspectRatio(crop, 1, bounds);
    expect(next.width / next.height).toBeCloseTo(1, 5);
    expect(next.x + next.width / 2).toBeCloseTo(400, 3);
  });

  it("clamps an oversized ratio into the stage", () => {
    const crop = { x: 0, y: 0, width: 1000, height: 500 };
    const next = applyAspectRatio(crop, 1, bounds);
    expect(next.height).toBeLessThanOrEqual(500 + 1e-6);
    expect(next.width).toBeCloseTo(next.height, 5);
  });

  it("leaves the rect alone when unlocking", () => {
    const crop = { x: 10, y: 10, width: 100, height: 300 };
    expect(applyAspectRatio(crop, null, bounds)).toEqual(crop);
  });
});

describe("constrainRect", () => {
  it("centres a rect that is larger than the bounds", () => {
    const next = constrainRect({ x: -500, y: -500, width: 4000, height: 400 }, bounds);
    expect(next.width).toBeLessThanOrEqual(1000);
    expect(next.x).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe("handlePosition", () => {
  it("reports the eight handle anchors", () => {
    const crop = { x: 0, y: 0, width: 100, height: 50 };
    expect(handlePosition(crop, "top-left")).toEqual({ x: 0, y: 0 });
    expect(handlePosition(crop, "bottom-right")).toEqual({ x: 100, y: 50 });
    expect(handlePosition(crop, "top")).toEqual({ x: 50, y: 0 });
    expect(handlePosition(crop, "left")).toEqual({ x: 0, y: 25 });
  });
});
