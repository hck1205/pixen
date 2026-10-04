import { describe, expect, it } from "vitest";
import { PINCH_POINTERS, TouchPoints } from "../src/viewport/touch.js";

/** Two fingers 100 apart, centred on (150, 100). */
function twoFingers(touch: TouchPoints): void {
  touch.down(1, { x: 100, y: 100 });
  touch.down(2, { x: 200, y: 100 });
}

describe("TouchPoints", () => {
  it("counts what is down, and forgets what is lifted", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    expect(touch.count).toBe(PINCH_POINTERS);
    touch.up(1);
    expect(touch.count).toBe(1);
  });

  it("ignores a move from a pointer it never saw go down", () => {
    const touch = new TouchPoints();
    touch.move(9, { x: 0, y: 0 });
    expect(touch.count).toBe(0);
  });

  it("has no step until a pinch is begun", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    expect(touch.pinching).toBe(false);
    expect(touch.step()).toBeNull();
  });

  it("reads a spread as a zoom about the point between the fingers", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    touch.beginPinch();

    touch.move(1, { x: 50, y: 100 });
    touch.move(2, { x: 250, y: 100 });
    const step = touch.step();

    expect(step?.factor).toBeCloseTo(2, 5);
    expect(step?.centre).toEqual({ x: 150, y: 100 });
    expect(step?.delta).toEqual({ x: 0, y: 0 });
  });

  it("reads both fingers moving together as a pan at the same scale", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    touch.beginPinch();

    touch.move(1, { x: 140, y: 130 });
    touch.move(2, { x: 240, y: 130 });
    const step = touch.step();

    expect(step?.factor).toBeCloseTo(1, 5);
    expect(step?.delta).toEqual({ x: 40, y: 30 });
  });

  it("measures each step from the last, not from where the pinch began", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    touch.beginPinch();

    touch.move(2, { x: 300, y: 100 });
    expect(touch.step()?.factor).toBeCloseTo(2, 5);
    touch.move(2, { x: 500, y: 100 });
    expect(touch.step()?.factor).toBeCloseTo(2, 5);
  });

  /**
   * Losing one finger has to end the pinch. Otherwise the next step measures
   * from a baseline taken with two fingers, and the picture jumps by whatever
   * distance the lifted one left behind.
   */
  it("ends the pinch when a finger lifts, rather than jumping", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    touch.beginPinch();
    touch.up(2);

    expect(touch.pinching).toBe(false);
    expect(touch.step()).toBeNull();
  });

  it("forgets everything on a cancel", () => {
    const touch = new TouchPoints();
    twoFingers(touch);
    touch.beginPinch();
    touch.cancel();

    expect(touch.count).toBe(0);
    expect(touch.pinching).toBe(false);
  });
});
