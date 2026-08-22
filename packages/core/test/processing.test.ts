import { describe, expect, it } from "vitest";
import {
  resolveQuality,
  checkPolicy,
  encodeWithinBudget,
  exportBackground,
  extensionForFormat,
  isLossy,
  policyToProcessOptions,
  PRESETS,
  resolveSize,
  standInSize,
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

describe("standInSize", () => {
  const source = { width: 4000, height: 3000 };

  it("leaves a modest reduction alone, because one draw already samples it fairly", () => {
    expect(standInSize(source, source, { width: 2400, height: 1800 })).toBeNull();
  });

  it("shrinks the source when the export is much smaller", () => {
    // 4000x3000 down to 200x150 is a factor of twenty; the stand-in puts the
    // source at the size the crop needs, so the scene's own draw is 1:1.
    expect(standInSize(source, source, { width: 200, height: 150 })).toEqual({ width: 200, height: 150 });
  });

  it("measures the reduction against the crop, not the whole bitmap", () => {
    // A postage-stamp crop exported at 300px is barely a reduction at all, even
    // though the source is thirteen times wider than the output.
    expect(standInSize(source, { width: 400, height: 300 }, { width: 300, height: 225 })).toBeNull();
  });

  it("shrinks the whole bitmap by the crop's factor, since the scene still places the crop", () => {
    // The crop is a quarter of the frame and is being shrunk eightfold, so the
    // bitmap it is cut from shrinks eightfold too.
    expect(standInSize(source, { width: 1000, height: 750 }, { width: 125, height: 94 })).toEqual({
      width: 500,
      height: 375,
    });
  });

  it("never asks for a copy that is not smaller", () => {
    // A one-pixel-wide source cannot shrink; a stand-in would be a copy.
    expect(standInSize({ width: 1, height: 4000 }, { width: 4000, height: 4000 }, { width: 100, height: 100 })).toBeNull();
  });

  it("keeps the source's aspect ratio, since the scene is told one scale for both axes", () => {
    // A thin strip, where rounding the width down to a whole pixel moves the
    // scale a long way. Sizing the height from `fit` instead of from the width's
    // rounded scale would give 1x100 here — the same picture, squashed threefold.
    expect(standInSize({ width: 3, height: 900 }, { width: 900, height: 900 }, { width: 100, height: 100 })).toEqual({
      width: 1,
      height: 300,
    });
  });
});

describe("exportBackground", () => {
  const document = { output: { background: null as string | null } } as never;
  const withBackground = (background: string | null) => ({ output: { background } }) as never;

  it("paints white under a format that cannot keep transparency", () => {
    expect(exportBackground(document, {}, "image/jpeg")).toBe("#ffffff");
  });

  it("leaves a format that can keep transparency transparent", () => {
    expect(exportBackground(document, {}, "image/png")).toBeNull();
    expect(exportBackground(document, {}, "image/webp")).toBeNull();
  });

  it("lets the document choose, whatever the format could have kept", () => {
    expect(exportBackground(withBackground("#123456"), {}, "image/png")).toBe("#123456");
    expect(exportBackground(withBackground("#123456"), {}, "image/jpeg")).toBe("#123456");
  });

  it("lets the caller override the document", () => {
    expect(exportBackground(withBackground("#123456"), { background: "#abcdef" }, "image/png")).toBe("#abcdef");
  });

  it("honours a caller asking for no background at all", () => {
    // The subtle one. `null` means "none", and a nullish fallback would read it
    // as "unset" and paint white over a transparency the caller asked for.
    expect(exportBackground(withBackground("#123456"), { background: null }, "image/png")).toBeNull();
    expect(exportBackground(document, { background: null }, "image/jpeg")).toBeNull();
  });
});

/**
 * The byte-budget search: re-encode at a lower quality until the result fits.
 *
 * The coverage page has claimed this since it was written and the only evidence
 * was a preset-to-options mapping assertion — the loop itself had no test at
 * all, because it needed a canvas and node has none. It needs the *encoder*, not
 * the canvas, so the encoder is now the seam.
 *
 * A stand-in whose size falls with quality the way a real one roughly does.
 */
function shrinkingEncoder(sizeAtFullQuality: number) {
  const attempts: number[] = [];
  return {
    attempts,
    encode: (quality: number) => {
      attempts.push(quality);
      return Promise.resolve(new Blob([new Uint8Array(Math.round(sizeAtFullQuality * quality))]));
    },
  };
}

describe("encodeWithinBudget", () => {
  const canvas = null as never;
  const JPEG = "image/jpeg" as const;

  it("stops at the first attempt when the picture already fits", () => {
    const encoder = shrinkingEncoder(1_000);
    return encodeWithinBudget(canvas, JPEG, 1, 10_000, { encode: encoder.encode }).then((result) => {
      expect(result.attempts).toBe(1);
      expect(result.quality).toBe(1);
      expect(encoder.attempts).toEqual([1]);
    });
  });

  it("re-encodes until it fits, and says what it settled on", async () => {
    // 10,000 bytes at full quality against a 5,000-byte budget: one attempt
    // cannot do it, and the budget is reachable without going under the quality
    // floor, so the search runs and comes back inside it.
    const encoder = shrinkingEncoder(10_000);
    const result = await encodeWithinBudget(canvas, JPEG, 1, 5_000, { encode: encoder.encode });

    expect(result.attempts).toBeGreaterThan(1);
    expect(result.blob.size).toBeLessThanOrEqual(5_000);
    expect(result.quality).toBeLessThan(1);
    // Each attempt aims lower than the last rather than wandering.
    for (let index = 1; index < encoder.attempts.length; index += 1) {
      expect(encoder.attempts[index]!).toBeLessThan(encoder.attempts[index - 1]!);
    }
  });

  it("reports every attempt against a ceiling, so a bar can finish early", async () => {
    const encoder = shrinkingEncoder(10_000);
    const reported: Array<[number, number]> = [];
    await encodeWithinBudget(canvas, JPEG, 1, 3_000, {
      encode: encoder.encode,
      onAttempt: (attempt, steps) => reported.push([attempt, steps]),
    });

    expect(reported.length).toBe(encoder.attempts.length);
    expect(reported.map(([attempt]) => attempt)).toEqual(reported.map((_, index) => index + 1));
    // The second number is the limit, not an estimate: most pictures stop early.
    expect(new Set(reported.map(([, steps]) => steps)).size).toBe(1);
  });

  it("gives up at the quality floor, and hands back a file over budget", async () => {
    // The behaviour worth knowing about. A budget nothing can meet has to end
    // somewhere, and going to a quality of zero would hand back a picture nobody
    // asked for — so it stops at the floor and returns a file that is *larger*
    // than the caller asked for rather than one they cannot use. A host that
    // must not exceed the budget has to check the size it got back.
    const encoder = shrinkingEncoder(1_000_000);
    const result = await encodeWithinBudget(canvas, JPEG, 1, 1, { encode: encoder.encode, minQuality: 0.4 });

    expect(result.quality).toBeGreaterThanOrEqual(0.4);
    expect(result.blob.size).toBeGreaterThan(1);
  });

  it("does not search at all for a format where quality means nothing", async () => {
    // PNG is lossless: re-encoding it at a lower quality is the same file again.
    const encoder = shrinkingEncoder(10_000);
    const result = await encodeWithinBudget(canvas, "image/png", 1, 1, { encode: encoder.encode });
    expect(result.attempts).toBe(1);
  });

  it("never makes more attempts than it was allowed", async () => {
    const encoder = shrinkingEncoder(1_000_000);
    const result = await encodeWithinBudget(canvas, JPEG, 1, 1, { encode: encoder.encode, steps: 3, minQuality: 0 });
    expect(result.attempts).toBeLessThanOrEqual(3);
    expect(encoder.attempts.length).toBeLessThanOrEqual(3);
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

/**
 * One quality number for two encoders is one of them being wrong.
 *
 * The defaults were measured rather than picked — three pictures encoded across
 * the range in Chromium and compared to the source pixel by pixel, recorded in
 * `docs/PROVENANCE.md`. What this pins is the shape of the decision, not the
 * numbers: the host outranks the format, the format outranks the fallback, and
 * an explicit zero is a request rather than an absence.
 */
describe("resolveQuality", () => {
  it("uses what the host stored, whatever the format", () => {
    expect(resolveQuality("image/jpeg", 0.5)).toBe(0.5);
    expect(resolveQuality("image/webp", 0.5)).toBe(0.5);
  });

  it("treats zero as a request, not as nothing", () => {
    // `?? ` rather than `||`: a host asking for the smallest possible file
    // means it, and falling back would silently give them a large one.
    expect(resolveQuality("image/jpeg", 0)).toBe(0);
  });

  it("asks the format when nobody said", () => {
    const jpeg = resolveQuality("image/jpeg", null);
    const webp = resolveQuality("image/webp", null);
    expect(jpeg).toBeGreaterThan(0);
    expect(webp).toBeGreaterThan(0);
    // The measured direction: matching JPEG's error took WebP lower on both
    // pictures where the error was visible at all.
    expect(webp).toBeLessThan(jpeg);
  });

  it("falls back for a format with no entry, including a lossless one", () => {
    expect(resolveQuality("image/png", null)).toBeGreaterThan(0);
    expect(resolveQuality("image/avif", undefined)).toBeGreaterThan(0);
  });
});
