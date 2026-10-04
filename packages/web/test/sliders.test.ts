/**
 * What the sliders offer, against what the engine will take.
 *
 * Only the straighten slider has an engine limit behind it, and it used to
 * restate that limit as ±45 with a comment promising the two agreed. They agree
 * by construction now; what is checked here is the part construction cannot
 * check — that the ends of the slider are angles the engine actually accepts,
 * rather than degrees that happen to convert to the same number.
 */
import { describe, expect, it } from "vitest";
import { clampStraighten, MAX_STRAIGHTEN, toDegrees, toRadians } from "@pixen/core";
import {
  CORNER_RATIO_RANGE,
  FONT_RATIO_RANGE,
  OPACITY_RANGE,
  OUTPUT_QUALITY_RANGE,
  ROTATION_RANGE,
  STRAIGHTEN_RANGE,
  STROKE_WIDTH_RANGE,
  type SliderRange,
} from "../src/element/sliders.js";

describe("the straighten slider and the engine's limit", () => {
  it("goes exactly as far each way as the engine will accept", () => {
    expect(STRAIGHTEN_RANGE.max).toBeCloseTo(toDegrees(MAX_STRAIGHTEN), 9);
    expect(STRAIGHTEN_RANGE.min).toBe(-STRAIGHTEN_RANGE.max);
  });

  it("hands the engine an angle it keeps, at either end", () => {
    for (const degrees of [STRAIGHTEN_RANGE.min, STRAIGHTEN_RANGE.max]) {
      // The engine holds the far end open by an epsilon, because 45° is equally
      // "no quarter turns and +45" and "one quarter turn and -45".
      expect(clampStraighten(toRadians(degrees)), `${degrees}°`).toBeCloseTo(toRadians(degrees), 5);
    }
  });

  it("cannot be dragged to an angle the engine would pull back", () => {
    const pastTheEnd = toRadians(STRAIGHTEN_RANGE.max + STRAIGHTEN_RANGE.step);
    expect(clampStraighten(pastTheEnd)).toBeLessThan(pastTheEnd);
  });
});

describe("every slider", () => {
  const ranges: ReadonlyArray<readonly [string, SliderRange]> = [
    ["stroke width", STROKE_WIDTH_RANGE],
    ["corner rounding", CORNER_RATIO_RANGE],
    ["type size", FONT_RATIO_RANGE],
    ["opacity", OPACITY_RANGE],
    ["rotation", ROTATION_RANGE],
    ["output quality", OUTPUT_QUALITY_RANGE],
    ["straighten", STRAIGHTEN_RANGE],
  ];

  it("has a step that divides the distance it covers", () => {
    // A step that does not divide the span leaves the far end unreachable: the
    // thumb stops one notch short of the value the panel says it offers.
    for (const [name, range] of ranges) {
      const notches = (range.max - range.min) / range.step;
      expect(Math.abs(notches - Math.round(notches)), name).toBeLessThan(1e-6);
    }
  });

  it("runs upwards, by an amount smaller than the span", () => {
    for (const [name, range] of ranges) {
      expect(range.max, name).toBeGreaterThan(range.min);
      expect(range.step, name).toBeGreaterThan(0);
      expect(range.step, name).toBeLessThan(range.max - range.min);
    }
  });
});
