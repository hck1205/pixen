/** Screen, stage and image: the three conversions a gesture goes through. */
import { describe, expect, it } from "vitest";
import { scaling, translation, compose } from "@pixen/core";
import { screenToImage, screenToStage } from "../../src/viewport/gestures/index.js";
import { context } from "./fixture.js";

describe("coordinate conversion", () => {
  it("is the identity when the view is untransformed", () => {
    expect(screenToStage(context(), { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it("undoes zoom and pan", () => {
    const view = compose(translation(50, 20), scaling(2));
    const ctx = context({ viewMatrix: view });
    expect(screenToStage(ctx, { x: 250, y: 120 })).toEqual({ x: 100, y: 50 });
  });

  it("undoes the document transform on the way to image space", () => {
    // Stage is the image scaled by two, so a stage point halves in image space.
    const ctx = context({ stageFromImage: scaling(2) });
    expect(screenToImage(ctx, { x: 100, y: 50 })).toEqual({ x: 50, y: 25 });
  });
});
