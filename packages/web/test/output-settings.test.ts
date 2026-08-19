import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT_EDGE,
  NATURAL_SIZE,
  OUTPUT_FORMATS,
  backgroundRequired,
  formatLabel,
  isResized,
  linkTogglePatch,
  qualityApplies,
  ratioLinked,
  resizePatch,
} from "../src/element/chrome/inspector/output-settings.js";

const current = { width: 1600, height: 1200 };

describe("resizePatch", () => {
  it("stores only the typed side while the ratio is linked, so the document scales the other", () => {
    expect(resizePatch("width", 800, current, true)).toEqual({ width: 800, height: null });
    expect(resizePatch("height", 600, current, true)).toEqual({ width: null, height: 600 });
  });

  it("pins both sides once the ratio is free", () => {
    expect(resizePatch("width", 800, current, false)).toEqual({ width: 800, height: 1200 });
    expect(resizePatch("height", 600, current, false)).toEqual({ width: 1600, height: 600 });
  });

  it("ignores a field that says nothing yet, rather than resizing to one pixel", () => {
    expect(resizePatch("width", Number.NaN, current, true)).toBeNull();
    expect(resizePatch("width", 0, current, true)).toBeNull();
    expect(resizePatch("width", -40, current, true)).toBeNull();
  });

  it("rounds, because pixels are whole", () => {
    expect(resizePatch("width", 800.6, current, true)).toEqual({ width: 801, height: null });
  });

  it("refuses to ask for a canvas no browser will allocate", () => {
    expect(resizePatch("width", 999_999, current, true)).toEqual({ width: MAX_OUTPUT_EDGE, height: null });
  });
});

describe("ratioLinked", () => {
  it("is linked while at most one side is pinned", () => {
    expect(ratioLinked({ width: null, height: null })).toBe(true);
    expect(ratioLinked({ width: 800, height: null })).toBe(true);
    expect(ratioLinked({ width: 800, height: 600 })).toBe(false);
  });

  it("pins what is on screen when unlinking, so nothing moves on the click", () => {
    expect(linkTogglePatch({ width: null, height: null }, current)).toEqual(current);
  });

  it("lets go of the height when linking again", () => {
    expect(linkTogglePatch({ width: 800, height: 600 }, { width: 800, height: 600 })).toEqual({
      width: 800,
      height: null,
    });
  });
});

describe("isResized", () => {
  it("is false only when neither side is pinned", () => {
    expect(isResized(NATURAL_SIZE)).toBe(false);
    expect(isResized({ width: 800, height: null })).toBe(true);
    expect(isResized({ width: null, height: 600 })).toBe(true);
  });
});

describe("formats", () => {
  it("offers auto first, because matching the input is the safe default", () => {
    expect(OUTPUT_FORMATS[0]).toBeNull();
    expect(OUTPUT_FORMATS.filter((format) => format !== null)).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("names them the way the world does", () => {
    expect(formatLabel("image/jpeg")).toBe("JPEG");
    expect(formatLabel("image/webp")).toBe("WebP");
  });

  it("offers quality only where the encoder throws information away", () => {
    expect(qualityApplies("image/jpeg")).toBe(true);
    expect(qualityApplies("image/webp")).toBe(true);
    expect(qualityApplies("image/png")).toBe(false);
  });

  it("needs a background exactly where there is no alpha channel", () => {
    expect(backgroundRequired("image/jpeg")).toBe(true);
    expect(backgroundRequired("image/png")).toBe(false);
    expect(backgroundRequired("image/webp")).toBe(false);
  });
});
