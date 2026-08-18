import { describe, expect, it } from "vitest";
import {
  checkPolicy,
  extensionForFormat,
  isLossy,
  policyToProcessOptions,
  PRESETS,
  resolveSize,
  stepDownPasses,
  supportsTransparency,
} from "@pixen/core";

describe("resolveSize", () => {
  const source = { width: 4000, height: 3000 };

  it("keeps the ratio when only a width is given", () => {
    expect(resolveSize(source, { width: 1600 })).toEqual({ width: 1600, height: 1200 });
  });

  it("keeps the ratio when only a height is given", () => {
    expect(resolveSize(source, { height: 1500 })).toEqual({ width: 2000, height: 1500 });
  });

  it("honours an explicit pair even when it distorts", () => {
    expect(resolveSize(source, { width: 100, height: 100 })).toEqual({ width: 100, height: 100 });
  });

  it("shrinks to fit the max hints", () => {
    expect(resolveSize(source, { maxWidth: 1600, maxHeight: 1600 })).toEqual({ width: 1600, height: 1200 });
  });

  it("leaves a small image alone under max hints", () => {
    expect(resolveSize({ width: 320, height: 240 }, { maxWidth: 1600 })).toEqual({ width: 320, height: 240 });
  });

  it("refuses to upscale by default", () => {
    expect(resolveSize({ width: 100, height: 100 }, { width: 400 })).toEqual({ width: 100, height: 100 });
  });

  it("upscales when the caller opts in", () => {
    expect(resolveSize({ width: 100, height: 100 }, { width: 400, preventUpscale: false })).toEqual({
      width: 400,
      height: 400,
    });
  });

  it("never returns a zero dimension", () => {
    expect(resolveSize(source, { scale: 0.00001 })).toEqual({ width: 1, height: 1 });
  });
});

describe("stepDownPasses", () => {
  it("draws directly for small reductions", () => {
    expect(stepDownPasses({ width: 1000, height: 1000 }, { width: 800, height: 800 })).toBe(0);
    expect(stepDownPasses({ width: 1000, height: 1000 }, { width: 500, height: 500 })).toBe(0);
  });

  it("halves repeatedly for large reductions", () => {
    expect(stepDownPasses({ width: 4000, height: 4000 }, { width: 250, height: 250 })).toBe(4);
  });

  it("stays within the pass cap", () => {
    expect(stepDownPasses({ width: 16384, height: 16384 }, { width: 1, height: 1 }, 3)).toBe(3);
  });
});

describe("format helpers", () => {
  it("knows which formats are lossy", () => {
    expect(isLossy("image/jpeg")).toBe(true);
    expect(isLossy("image/png")).toBe(false);
  });

  it("knows which formats keep alpha", () => {
    expect(supportsTransparency("image/png")).toBe(true);
    expect(supportsTransparency("image/webp")).toBe(true);
    expect(supportsTransparency("image/jpeg")).toBe(false);
  });

  it("maps formats to file extensions", () => {
    expect(extensionForFormat("image/jpeg")).toBe("jpg");
    expect(extensionForFormat("image/webp")).toBe("webp");
  });
});

describe("policies", () => {
  it("passes a compliant image", () => {
    expect(checkPolicy("profile", { width: 1024, height: 1024, bytes: 200_000 })).toEqual([]);
  });

  it("reports every broken rule", () => {
    const violations = checkPolicy("profile", { width: 200, height: 100, bytes: 2_000_000 });
    expect(violations.map((v) => v.rule)).toEqual(["minWidth", "minHeight", "aspectRatio", "maxFileSize"]);
  });

  it("tolerates a rounding-level ratio error", () => {
    expect(checkPolicy({ aspectRatio: 16 / 9 }, { width: 1920, height: 1081 })).toEqual([]);
  });

  it("translates a preset into processing options", () => {
    const options = policyToProcessOptions("marketplace");
    expect(options.maxWidth).toBe(1600);
    expect(options.format).toBe("image/webp");
    expect(options.maxBytes).toBe(PRESETS.marketplace.maxFileSize);
  });
});
