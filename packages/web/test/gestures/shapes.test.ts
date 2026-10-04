/** The rectangle a drag describes, and when it is too small to keep. */
import { describe, expect, it } from "vitest";
import { createPathLayer, createRectLayer } from "@pixen/core";
import { constrainToAxis, frameFrom, isDegenerate } from "../../src/viewport/gestures/index.js";

describe("shape helpers", () => {
  it("builds a frame from any drag direction", () => {
    expect(frameFrom({ x: 10, y: 10 }, { x: 30, y: 40 }, false)).toEqual({ x: 10, y: 10, width: 20, height: 30 });
    expect(frameFrom({ x: 30, y: 40 }, { x: 10, y: 10 }, false)).toEqual({ x: 10, y: 10, width: 20, height: 30 });
  });

  it("squares a frame while keeping the drag direction", () => {
    expect(frameFrom({ x: 0, y: 0 }, { x: -50, y: -10 }, true)).toEqual({ x: -50, y: -50, width: 50, height: 50 });
  });

  it("snaps to whichever axis moved further", () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 50, y: 10 })).toEqual({ x: 50, y: 0 });
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 10, y: 50 })).toEqual({ x: 0, y: 50 });
  });

  it("recognises degenerate shapes of each type", () => {
    expect(isDegenerate(createRectLayer({ x: 0, y: 0, width: 1, height: 1 }), 1000)).toBe(true);
    expect(isDegenerate(createRectLayer({ x: 0, y: 0, width: 100, height: 1 }), 1000)).toBe(false);
    expect(isDegenerate(createPathLayer([{ x: 0, y: 0 }]), 1000)).toBe(true);
  });

  it("scales the threshold with the image", () => {
    const small = createRectLayer({ x: 0, y: 0, width: 20, height: 20 });
    expect(isDegenerate(small, 1000)).toBe(false);
    expect(isDegenerate(small, 100000)).toBe(true);
  });
});
