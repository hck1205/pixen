import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_PRESETS,
  clampAdjustments,
  DEFAULT_ADJUSTMENTS,
  matchingPreset,
  presetAdjustments,
  type Adjustments,
} from "@pixen/core";

/** A full adjustment set, so a test only names the values it cares about. */
function adjust(overrides: Partial<Adjustments> = {}): Adjustments {
  return { ...DEFAULT_ADJUSTMENTS, ...overrides };
}

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
