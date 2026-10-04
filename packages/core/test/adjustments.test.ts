/**
 * The two ways a colour adjustment reaches the screen, and the choice between.
 *
 * A browser with `ctx.filter` runs the chain `cssFilter` emits; one without
 * runs the same adjustments a pixel at a time. Three of them — gamma,
 * temperature, tint — no filter chain can express, so they cost a pass either
 * way. `adjustmentPlan` is what keeps the two engines reaching the same
 * picture, and most of what follows is aimed at it.
 */
import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_KEYS,
  adjustmentPlan,
  applyAdjustmentsToImageData,
  cssFilter,
  DEFAULT_ADJUSTMENTS,
  PIXEL_ONLY_ADJUSTMENTS,
  type Adjustments,
} from "@pixen/core";

const adjustments = (over: Partial<Adjustments> = {}): Adjustments => ({ ...DEFAULT_ADJUSTMENTS, ...over });

/** One mid-grey pixel, which is where a gamma curve shows most. */
const grey = () => new Uint8ClampedArray([128, 128, 128, 255]);

describe("adjustmentPlan", () => {
  it("uses the filter alone when the filter can say everything", () => {
    const set = adjustments({ brightness: 0.2 });
    const plan = adjustmentPlan(set, true);
    expect(plan.filter).not.toBe("");
    expect(plan.pixels).toBeNull();
  });

  it("adds a pass for the three the filter cannot say", () => {
    const set = adjustments({ brightness: 0.2, gamma: 0.5 });
    const plan = adjustmentPlan(set, true);
    expect(plan.filter).toContain("brightness");
    // Only the ones the filter did not do, or they would be applied twice.
    expect(plan.pixels).toMatchObject({ gamma: 0.5, brightness: 0 });
  });

  it("does everything per pixel when the engine has no filter", () => {
    const set = adjustments({ brightness: 0.2, gamma: 0.5 });
    const plan = adjustmentPlan(set, false);
    expect(plan.filter).toBe("");
    expect(plan.pixels).toMatchObject({ brightness: 0.2, gamma: 0.5 });
  });

  it("asks for nothing at all on an untouched picture, either way", () => {
    const set = adjustments();
    expect(adjustmentPlan(set, true)).toEqual({ filter: "", pixels: null });
    expect(adjustmentPlan(set, false)).toEqual({ filter: "", pixels: null });
  });

  it("still asks for a pass with no filter and only a pixel-only adjustment", () => {
    // `cssFilter` is empty here, so a plan keyed on the filter string alone
    // would decide there was nothing to do.
    const set = adjustments({ temperature: 0.4 });
    expect(cssFilter(set)).toBe("");
    expect(adjustmentPlan(set, false).pixels).not.toBeNull();
    expect(adjustmentPlan(set, true).pixels).not.toBeNull();
  });

  it("names the three, and they are three the filter cannot express", () => {
    for (const key of PIXEL_ONLY_ADJUSTMENTS) {
      expect(cssFilter(adjustments({ [key]: 0.5 })), key).toBe("");
    }
  });
});

describe("gamma", () => {
  it("lifts the midtones one way and drops them the other", () => {
    const lifted = grey();
    applyAdjustmentsToImageData(lifted, adjustments({ gamma: 1 }));
    const dropped = grey();
    applyAdjustmentsToImageData(dropped, adjustments({ gamma: -1 }));

    expect(lifted[0]!).toBeGreaterThan(128);
    expect(dropped[0]!).toBeLessThan(128);
  });

  it("leaves black and white where they are, which is what a curve does", () => {
    const ends = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    applyAdjustmentsToImageData(ends, adjustments({ gamma: 0.8 }));
    expect([ends[0], ends[4]]).toEqual([0, 255]);
  });

  it("does nothing at its neutral, which is zero like everything else's", () => {
    const untouched = grey();
    applyAdjustmentsToImageData(untouched, adjustments({ gamma: 0 }));
    expect([...untouched]).toEqual([128, 128, 128, 255]);
  });
});

describe("white balance", () => {
  it("warms towards amber and cools towards blue", () => {
    const warm = grey();
    applyAdjustmentsToImageData(warm, adjustments({ temperature: 1 }));
    expect(warm[0]!).toBeGreaterThan(warm[2]!);

    const cool = grey();
    applyAdjustmentsToImageData(cool, adjustments({ temperature: -1 }));
    expect(cool[2]!).toBeGreaterThan(cool[0]!);
  });

  it("runs green to magenta on the other axis", () => {
    const magenta = grey();
    applyAdjustmentsToImageData(magenta, adjustments({ tint: 1 }));
    expect(magenta[0]!).toBeGreaterThan(magenta[1]!);
    expect(magenta[2]!).toBeGreaterThan(magenta[1]!);

    const green = grey();
    applyAdjustmentsToImageData(green, adjustments({ tint: -1 }));
    expect(green[1]!).toBeGreaterThan(green[0]!);
  });

  it("leaves the picture alone at neutral", () => {
    const untouched = grey();
    applyAdjustmentsToImageData(untouched, adjustments({ temperature: 0, tint: 0 }));
    expect([...untouched]).toEqual([128, 128, 128, 255]);
  });
});

describe("the two engines", () => {
  it("reach the same picture, filter or no filter", () => {
    // The whole reason the plan exists. With a filter the browser does the
    // first part and the pass does the rest; without one the pass does all of
    // it — and an export must not differ from the preview because of that.
    const set = adjustments({ gamma: 0.4, temperature: 0.3 });
    const withFilter = adjustmentPlan(set, true);
    const without = adjustmentPlan(set, false);

    const one = grey();
    applyAdjustmentsToImageData(one, withFilter.pixels!);
    const other = grey();
    applyAdjustmentsToImageData(other, without.pixels!);

    // `cssFilter` says nothing about these two, so both paths run the same pass.
    expect([...one]).toEqual([...other]);
  });
});

/**
 * A pass over every pixel of a 48-megapixel photograph is not something to do
 * for nothing — and the guard that decides was a hand-written copy of what the
 * loop reads, which is one list too many.
 */
describe("when the pass runs at all", () => {
  const pixels = () => new Uint8ClampedArray([10, 20, 30, 255]);

  it("says it did nothing for an untouched picture, and does nothing", () => {
    const data = pixels();
    expect(applyAdjustmentsToImageData(data, adjustments())).toBe(false);
    expect([...data]).toEqual([10, 20, 30, 255]);
  });

  it("says it did nothing for a vignette, which is drawn rather than filtered", () => {
    // The answer, not the pixels: a pass that ran and changed nothing leaves
    // the same bytes behind as one that never ran, and costs a megapixel.
    const data = pixels();
    expect(applyAdjustmentsToImageData(data, adjustments({ vignette: 1 }))).toBe(false);
    expect([...data]).toEqual([10, 20, 30, 255]);
  });

  it("runs, and says so, for every adjustment that is not the vignette", () => {
    for (const key of ADJUSTMENT_KEYS.filter((name) => name !== "vignette")) {
      const data = pixels();
      expect(applyAdjustmentsToImageData(data, adjustments({ [key]: key === "hue" ? 90 : 0.5 })), key).toBe(true);
      expect([...data], key).not.toEqual([10, 20, 30, 255]);
    }
  });
});

describe("cssFilter", () => {
  it("is empty when nothing is adjusted", () => {
    expect(cssFilter(adjustments())).toBe("");
  });

  it("maps -1..1 onto CSS factors", () => {
    expect(cssFilter(adjustments({ brightness: 0.2, contrast: -0.5, saturation: 1 }))).toBe(
      "brightness(1.2) contrast(0.5) saturate(2)",
    );
  });

  it("clamps absurd values", () => {
    expect(cssFilter(adjustments({ brightness: 99, contrast: -99 }))).toBe("brightness(4) contrast(0)");
  });

  it("reads exposure in stops, so one stop is a doubling", () => {
    expect(cssFilter(adjustments({ exposure: 1 }))).toBe("brightness(2)");
    expect(cssFilter(adjustments({ exposure: -1 }))).toBe("brightness(0.5)");
  });

  it("emits the tonal filters in the order they are applied", () => {
    expect(cssFilter(adjustments({ hue: 30, grayscale: 0.5, sepia: 0.25, invert: 1 }))).toBe(
      "hue-rotate(30deg) grayscale(0.5) sepia(0.25) invert(1)",
    );
  });

  it("leaves the vignette out, because it is drawn rather than filtered", () => {
    expect(cssFilter(adjustments({ vignette: 1 }))).toBe("");
  });
});

describe("pixel adjustment fallback", () => {
  const pixel = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

  it("brightens every channel", () => {
    const data = pixel(100, 100, 100);
    applyAdjustmentsToImageData(data, adjustments({ brightness: 0.5 }));
    expect(data[0]).toBe(150);
  });

  it("doubles for a stop of exposure", () => {
    const data = pixel(60, 60, 60);
    applyAdjustmentsToImageData(data, adjustments({ exposure: 1 }));
    expect(data[0]).toBe(120);
  });

  it("drains colour at full grayscale", () => {
    const data = pixel(200, 40, 40);
    applyAdjustmentsToImageData(data, adjustments({ grayscale: 1 }));
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });

  it("inverts", () => {
    const data = pixel(0, 40, 255);
    applyAdjustmentsToImageData(data, adjustments({ invert: 1 }));
    expect([data[0], data[1], data[2]]).toEqual([255, 215, 0]);
  });

  it("warms towards the sepia matrix", () => {
    const data = pixel(120, 120, 120);
    applyAdjustmentsToImageData(data, adjustments({ sepia: 1 }));
    // The specification's matrix pushes red above blue on a neutral grey.
    expect(data[0]!).toBeGreaterThan(data[2]!);
  });

  it("leaves pixels untouched when nothing is adjusted", () => {
    const data = pixel(10, 20, 30);
    applyAdjustmentsToImageData(data, adjustments());
    expect([...data]).toEqual([10, 20, 30, 255]);
  });

  it("ignores the vignette, which the chain does not carry either", () => {
    const data = pixel(10, 20, 30);
    applyAdjustmentsToImageData(data, adjustments({ vignette: 1 }));
    expect([...data]).toEqual([10, 20, 30, 255]);
  });
});
