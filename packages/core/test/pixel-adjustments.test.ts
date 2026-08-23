import { describe, expect, it } from "vitest";
import {
  adjustmentPlan,
  applyAdjustmentsToImageData,
  cssFilter,
  DEFAULT_ADJUSTMENTS,
  PIXEL_ONLY_ADJUSTMENTS,
  type Adjustments,
} from "@pixen/core";

/**
 * The three adjustments a canvas filter cannot express.
 *
 * Not a gap in the browsers: a filter chain is a fixed set of functions, and a
 * gamma curve and a channel gain are not among them. So they cost a pass over
 * every pixel whatever engine is drawing — and the two engines still have to
 * reach the same picture, which is what `adjustmentPlan` is for.
 */
const adjustments = (over: Partial<Adjustments> = {}): Adjustments => ({ ...DEFAULT_ADJUSTMENTS, ...over });

/** One mid-grey pixel, which is where a gamma curve shows most. */
const grey = () => new Uint8ClampedArray([128, 128, 128, 255]);

describe("adjustmentPlan", () => {
  it("uses the filter alone when the filter can say everything", () => {
    const set = adjustments({ brightness: 0.2 });
    const plan = adjustmentPlan(set, cssFilter(set), true);
    expect(plan.filter).not.toBe("");
    expect(plan.pixels).toBeNull();
  });

  it("adds a pass for the three the filter cannot say", () => {
    const set = adjustments({ brightness: 0.2, gamma: 0.5 });
    const plan = adjustmentPlan(set, cssFilter(set), true);
    expect(plan.filter).toContain("brightness");
    // Only the ones the filter did not do, or they would be applied twice.
    expect(plan.pixels).toMatchObject({ gamma: 0.5, brightness: 0 });
  });

  it("does everything per pixel when the engine has no filter", () => {
    const set = adjustments({ brightness: 0.2, gamma: 0.5 });
    const plan = adjustmentPlan(set, cssFilter(set), false);
    expect(plan.filter).toBe("");
    expect(plan.pixels).toMatchObject({ brightness: 0.2, gamma: 0.5 });
  });

  it("asks for nothing at all on an untouched picture, either way", () => {
    const set = adjustments();
    expect(adjustmentPlan(set, cssFilter(set), true)).toEqual({ filter: "", pixels: null });
    expect(adjustmentPlan(set, cssFilter(set), false)).toEqual({ filter: "", pixels: null });
  });

  it("still asks for a pass with no filter and only a pixel-only adjustment", () => {
    // `cssFilter` is empty here, so a plan keyed on the filter string alone
    // would decide there was nothing to do.
    const set = adjustments({ temperature: 0.4 });
    expect(cssFilter(set)).toBe("");
    expect(adjustmentPlan(set, "", false).pixels).not.toBeNull();
    expect(adjustmentPlan(set, "", true).pixels).not.toBeNull();
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
    const withFilter = adjustmentPlan(set, cssFilter(set), true);
    const without = adjustmentPlan(set, cssFilter(set), false);

    const one = grey();
    applyAdjustmentsToImageData(one, withFilter.pixels!);
    const other = grey();
    applyAdjustmentsToImageData(other, without.pixels!);

    // `cssFilter` says nothing about these two, so both paths run the same pass.
    expect([...one]).toEqual([...other]);
  });
});
