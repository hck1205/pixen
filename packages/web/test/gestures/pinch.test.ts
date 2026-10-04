/** Two fingers, or a wheel: the zoom factor and the pan a step produces. */
import { describe, expect, it } from "vitest";
import { pinchFrom, pinchStep, wheelZoomFactor } from "../../src/viewport/gestures/index.js";

describe("pinch and wheel", () => {
  it("measures distance and centre between two pointers", () => {
    expect(pinchFrom({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({ distance: 10, centre: { x: 3, y: 4 } });
  });

  it("turns two pinch samples into a zoom factor and a pan", () => {
    const step = pinchStep(
      { distance: 100, centre: { x: 0, y: 0 } },
      { distance: 150, centre: { x: 10, y: -5 } },
    );
    expect(step.factor).toBeCloseTo(1.5);
    expect(step.delta).toEqual({ x: 10, y: -5 });
  });

  it("never divides by a zero starting distance", () => {
    expect(pinchStep({ distance: 0, centre: { x: 0, y: 0 } }, pinchFrom({ x: 0, y: 0 }, { x: 5, y: 0 })).factor).toBe(1);
  });

  it("zooms in on a negative wheel delta and out on a positive one", () => {
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, false)).toBeLessThan(1);
  });

  it("responds harder to a trackpad pinch than to a wheel", () => {
    expect(wheelZoomFactor(-100, true)).toBeGreaterThan(wheelZoomFactor(-100, false));
  });
});
