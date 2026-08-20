import { describe, expect, it } from "vitest";
import { assertDrawableSize, isPixenError, MAX_CANVAS_PIXELS } from "@pixen/core";

/**
 * The ceiling `docs/SECURITY.md` promises, tested rather than asserted.
 *
 * This is the one guard in the package that exists because of a hostile file
 * rather than a careless caller: a few kilobytes of PNG can describe a picture
 * of fifty thousand pixels a side, and a canvas that size is a tab that dies.
 * It had a paragraph of documentation and a coverage entry citing it, and
 * nothing that would notice if the check stopped working.
 */
function refusal(size: { width: number; height: number }): { code: string; message: string } {
  try {
    assertDrawableSize(size, "test surface");
  } catch (error) {
    if (!isPixenError(error)) throw error;
    return { code: error.code, message: error.message };
  }
  throw new Error(`${size.width}x${size.height} was allowed through`);
}

describe("assertDrawableSize", () => {
  it("allows an ordinary picture", () => {
    expect(() => assertDrawableSize({ width: 6000, height: 4000 })).not.toThrow();
  });

  it("allows exactly the limit, which is a square of 16384", () => {
    expect(MAX_CANVAS_PIXELS).toBe(16_384 * 16_384);
    expect(() => assertDrawableSize({ width: 16_384, height: 16_384 })).not.toThrow();
  });

  it("refuses one pixel past the limit", () => {
    // The boundary rather than something wildly over it: an off-by-one here is
    // a limit that is not the limit anybody documented.
    expect(refusal({ width: 16_385, height: 16_384 }).code).toBe("MEMORY_LIMIT");
  });

  it("judges the area rather than either edge", () => {
    // A panorama four times wider than the square limit, and half its pixels:
    // allowed, because the budget is memory and this uses less of it than a
    // picture that would pass on both edges.
    expect(() => assertDrawableSize({ width: 65_536, height: 4_096 })).not.toThrow();
    // And a bomb stays a bomb whatever shape it is.
    expect(refusal({ width: 100_000, height: 3_000 }).code).toBe("MEMORY_LIMIT");
  });

  it("says what was asked for and what the limit is, since a host has to report it", () => {
    const { message } = refusal({ width: 30_000, height: 30_000 });
    expect(message).toContain("30000x30000");
    expect(message).toContain(String(MAX_CANVAS_PIXELS));
    expect(message).toContain("test surface");
  });

  it("refuses an empty surface, which is a different failure from a huge one", () => {
    // `INVALID_IMAGE` rather than `MEMORY_LIMIT`: nothing is out of memory, the
    // input made no sense, and a host showing "too large" for it would mislead.
    expect(refusal({ width: 0, height: 100 }).code).toBe("INVALID_IMAGE");
    expect(refusal({ width: 100, height: 0 }).code).toBe("INVALID_IMAGE");
    expect(refusal({ width: -5, height: 5 }).code).toBe("INVALID_IMAGE");
  });

  it("refuses a size that is not a number at all", () => {
    // NaN fails every comparison, so a check written as `> MAX` alone would let
    // it through and the allocation would be the thing that failed.
    expect(refusal({ width: Number.NaN, height: 100 }).code).toBe("INVALID_IMAGE");
    expect(refusal({ width: Number.POSITIVE_INFINITY, height: 100 }).code).toBe("INVALID_IMAGE");
  });

  it("rounds a fractional size up before judging it", () => {
    // A surface is allocated in whole pixels, so the question is what will be
    // allocated rather than what was asked for.
    expect(() => assertDrawableSize({ width: 0.4, height: 0.4 })).not.toThrow();
    expect(refusal({ width: 16_384.1, height: 16_384 }).code).toBe("MEMORY_LIMIT");
  });
});
