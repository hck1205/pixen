import { describe, expect, it } from "vitest";
import {
  applyToPoint,
  compose,
  fitAspectRatio,
  imageToOutput,
  imageToStage,
  invert,
  matrixEquals,
  multiply,
  rotation,
  boundsOf,
  resolveSize,
  rotatedBounds,
  scaling,
  stageSizeFor,
  stageToImage,
  stageToOutput,
  translation,
  transformBounds,
  zoomToFit,
  IDENTITY,
} from "@pixen/core";

const HALF_TURN = Math.PI;
const QUARTER = Math.PI / 2;

function closeTo(actual: { x: number; y: number }, expected: { x: number; y: number }, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe("matrix", () => {
  it("applies the right-hand matrix first", () => {
    const m = multiply(translation(10, 0), scaling(2));
    closeTo(applyToPoint(m, { x: 3, y: 4 }), { x: 16, y: 8 });
  });

  it("inverts back to the identity", () => {
    const m = compose(translation(12, -4), rotation(0.7), scaling(2, 3));
    expect(matrixEquals(multiply(m, invert(m)), IDENTITY, 1e-9)).toBe(true);
  });

  it("rejects singular matrices instead of producing NaN", () => {
    expect(() => invert(scaling(0, 1))).toThrow(RangeError);
  });
});

describe("rotatedBounds", () => {
  it("swaps the axes on a quarter turn", () => {
    const bounds = rotatedBounds({ width: 400, height: 200 }, QUARTER);
    expect(bounds.width).toBeCloseTo(200);
    expect(bounds.height).toBeCloseTo(400);
  });

  it("grows the box on a 45 degree turn", () => {
    const bounds = rotatedBounds({ width: 100, height: 100 }, Math.PI / 4);
    expect(bounds.width).toBeCloseTo(Math.SQRT2 * 100);
  });
});

describe("image -> stage", () => {
  const image = { width: 400, height: 200 };

  it("is the identity without a transform", () => {
    const m = imageToStage(image, { rotation: 0, flipX: false, flipY: false });
    closeTo(applyToPoint(m, { x: 0, y: 0 }), { x: 0, y: 0 });
    closeTo(applyToPoint(m, { x: 400, y: 200 }), { x: 400, y: 200 });
  });

  it("puts the image top-left at the stage top-right after a quarter turn", () => {
    const transform = { rotation: QUARTER, flipX: false, flipY: false };
    const stage = stageSizeFor(image, transform);
    expect(stage).toEqual({ width: 200, height: 400 });

    const m = imageToStage(image, transform);
    closeTo(applyToPoint(m, { x: 0, y: 0 }), { x: 200, y: 0 });
    closeTo(applyToPoint(m, { x: 400, y: 0 }), { x: 200, y: 400 });
    closeTo(applyToPoint(m, { x: 0, y: 200 }), { x: 0, y: 0 });
  });

  it("mirrors horizontally on flipX", () => {
    const m = imageToStage(image, { rotation: 0, flipX: true, flipY: false });
    closeTo(applyToPoint(m, { x: 0, y: 0 }), { x: 400, y: 0 });
    closeTo(applyToPoint(m, { x: 400, y: 200 }), { x: 0, y: 200 });
  });

  it("keeps a 180 degree turn a pure point reflection", () => {
    const m = imageToStage(image, { rotation: HALF_TURN, flipX: false, flipY: false });
    closeTo(applyToPoint(m, { x: 0, y: 0 }), { x: 400, y: 200 });
  });

  it("round-trips through stageToImage for every quarter turn and flip", () => {
    for (const turns of [0, 1, 2, 3]) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const transform = { rotation: turns * QUARTER, flipX, flipY };
          const forward = imageToStage(image, transform);
          const backward = stageToImage(image, transform);
          const point = { x: 123, y: 45 };
          closeTo(applyToPoint(backward, applyToPoint(forward, point)), point, 6);
        }
      }
    }
  });
});

describe("stage -> output", () => {
  it("maps the crop rect onto the full target", () => {
    const crop = { x: 100, y: 50, width: 200, height: 100 };
    const m = stageToOutput(crop, { width: 400, height: 200 });
    closeTo(applyToPoint(m, { x: 100, y: 50 }), { x: 0, y: 0 });
    closeTo(applyToPoint(m, { x: 300, y: 150 }), { x: 400, y: 200 });
  });

  it("composes with the stage matrix so a rotated crop still fills the export", () => {
    const image = { width: 400, height: 200 };
    const transform = { rotation: QUARTER, flipX: false, flipY: false };
    const crop = { x: 0, y: 100, width: 200, height: 200 };
    const target = { width: 512, height: 512 };
    const m = imageToOutput(image, transform, crop, target);
    const bounds = transformBounds(m, { x: 0, y: 0, width: 400, height: 200 });
    // The whole image maps to a box that covers the export target.
    expect(bounds.x).toBeLessThanOrEqual(0.001);
    expect(bounds.y).toBeLessThanOrEqual(0.001);
    expect(bounds.width).toBeGreaterThanOrEqual(512);
  });
});

describe("fitting helpers", () => {
  it("fits a 16:9 rect inside a square", () => {
    const fitted = fitAspectRatio({ width: 100, height: 100 }, 16 / 9);
    expect(fitted.width).toBeCloseTo(100);
    expect(fitted.height).toBeCloseTo(56.25);
    expect(fitted.y).toBeCloseTo(21.875);
  });

  it("computes a fit zoom with padding", () => {
    expect(zoomToFit({ width: 1000, height: 500 }, { width: 500, height: 500 }, 0)).toBeCloseTo(0.5);
    expect(zoomToFit({ width: 1000, height: 500 }, { width: 600, height: 600 }, 50)).toBeCloseTo(0.5);
  });
});

describe("resolveSize fit", () => {
  const landscape = { width: 1600, height: 800 };
  const box = { width: 400, height: 400 };

  it("reads a width and height pair literally by default", () => {
    // Two boxes filled in by hand usually mean exactly those numbers.
    expect(resolveSize(landscape, { ...box })).toEqual(box);
  });

  it("fits inside the box when asked to contain", () => {
    expect(resolveSize(landscape, { ...box, fit: "contain" })).toEqual({ width: 400, height: 200 });
  });

  it("fills the box when asked to cover, and lets the picture overflow", () => {
    expect(resolveSize(landscape, { ...box, fit: "cover", preventUpscale: false })).toEqual({
      width: 800,
      height: 400,
    });
  });

  it("still refuses to enlarge unless told it may", () => {
    const small = { width: 100, height: 50 };
    expect(resolveSize(small, { width: 400, height: 400, fit: "contain" })).toEqual(small);
    expect(resolveSize(small, { width: 400, height: 400, fit: "contain", preventUpscale: false })).toEqual({
      width: 400,
      height: 200,
    });
  });

  it("ignores the fit when only one edge is given, which already keeps the ratio", () => {
    expect(resolveSize(landscape, { width: 400, fit: "cover" })).toEqual({ width: 400, height: 200 });
  });
});

describe("boundsOf", () => {
  it("boxes a set of points", () => {
    expect(boundsOf([{ x: 10, y: 40 }, { x: -5, y: 12 }, { x: 3, y: 90 }])).toEqual({
      x: -5,
      y: 12,
      width: 15,
      height: 78,
    });
  });

  it("gives a single point a box with no size", () => {
    expect(boundsOf([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9, width: 0, height: 0 });
  });

  it("calls an empty set the zero rect, which is what every caller means by it", () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
