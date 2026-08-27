import { describe, expect, it } from "vitest";
import { DEFAULT_HEAL_FEATHER, healRegion } from "../src/render/heal.js";

/**
 * A blemish is taken out by growing the surroundings over it. The test for
 * that is not "does it look right" but "is the spot still there" — a number,
 * against a picture where the answer is knowable.
 */
const CHANNELS = 4;

function canvas(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * CHANNELS);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const at = (y * width + x) * CHANNELS;
      pixels[at] = r;
      pixels[at + 1] = g;
      pixels[at + 2] = b;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

const read = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => {
  const at = (y * width + x) * CHANNELS;
  return [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!] as const;
};

describe("healing a spot", () => {
  it("takes a blemish off a flat background", () => {
    // Grey everywhere, with a red blob in the middle.
    const pixels = canvas(40, 40, (x, y) => (Math.hypot(x - 20, y - 20) < 5 ? [255, 0, 0] : [128, 128, 128]));
    expect(read(pixels, 40, 20, 20)).toEqual([255, 0, 0]);

    healRegion(pixels, 40, 40, { x: 12, y: 12, width: 16, height: 16 });

    const [r, g, b] = read(pixels, 40, 20, 20);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
    expect(Math.abs(r - g)).toBeLessThan(4);
    expect(Math.abs(g - b)).toBeLessThan(4);
  });

  it("leans towards the boundary it is nearest, rather than averaging them", () => {
    // A horizontal gradient, healed. Near the left rim the answer should be
    // near what the left rim *is* — an unweighted average of the four
    // boundaries would put the mean of the whole span there instead, which on
    // this fixture is about fourteen levels too bright.
    const value = (x: number) => Math.round((x / 59) * 255);
    const pixels = canvas(60, 20, (x) => [value(x), 0, 0]);
    healRegion(pixels, 60, 20, { x: 20, y: 4, width: 20, height: 12 }, 0);

    expect(read(pixels, 60, 23, 10)[0]).toBeCloseTo(value(23), -0.7);
    expect(read(pixels, 60, 36, 10)[0]).toBeCloseTo(value(36), -0.7);
  });

  it("invents no colour: everything it writes came from the picture", () => {
    // Two colours only. Anything outside that range would be made up.
    const pixels = canvas(40, 40, (x, y) => (Math.hypot(x - 20, y - 20) < 6 ? [0, 0, 0] : [200, 200, 200]));
    healRegion(pixels, 40, 40, { x: 12, y: 12, width: 16, height: 16 }, 0);
    for (let i = 0; i < pixels.length; i += CHANNELS) {
      expect(pixels[i]).toBeLessThanOrEqual(200);
      expect(pixels[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("heals the ellipse and not the rectangle around it", () => {
    // Textured, so "unchanged" is a real claim: on a flat colour every pixel
    // heals to the colour it already was and the corners look untouched
    // whether they were skipped or not.
    const pixels = canvas(40, 40, (x, y) => [((x >> 1) + (y >> 1)) % 2 === 0 ? 240 : 20, 0, 0]);
    const before = pixels.slice();
    healRegion(pixels, 40, 40, { x: 10, y: 10, width: 20, height: 20 }, 0);

    // The corners of the bounding box are outside the ellipse inscribed in it.
    expect(read(pixels, 40, 11, 11)).toEqual(read(before, 40, 11, 11));
    expect(read(pixels, 40, 28, 28)).toEqual(read(before, 40, 28, 28));
    expect(read(pixels, 40, 0, 0)).toEqual(read(before, 40, 0, 0));
    // And the middle did change, so the test is not passing by doing nothing.
    expect(read(pixels, 40, 20, 20)).not.toEqual(read(before, 40, 20, 20));
  });

  it("fades back to the picture at the rim, so the repair is not a shape", () => {
    // A texture, so the healed value differs from the original everywhere —
    // otherwise a fade has nothing to fade between.
    const textured = () => canvas(40, 40, (x, y) => [((x >> 1) + (y >> 1)) % 2 === 0 ? 240 : 20, 0, 0]);
    const original = textured();
    const hard = textured();
    const soft = textured();
    const region = { x: 8, y: 8, width: 24, height: 24 };
    healRegion(hard, 40, 40, region, 0);
    healRegion(soft, 40, 40, region, DEFAULT_HEAL_FEATHER);

    // How far each strayed from the picture, in a ring just inside the rim.
    const strayInRing = (pixels: Uint8ClampedArray) => {
      let total = 0;
      let count = 0;
      for (let y = 8; y < 32; y += 1) {
        for (let x = 8; x < 32; x += 1) {
          const distance = Math.hypot(x + 0.5 - 20, y + 0.5 - 20) / 12;
          if (distance >= 1 || distance < 0.85) continue;
          total += Math.abs(read(pixels, 40, x, y)[0] - read(original, 40, x, y)[0]);
          count += 1;
        }
      }
      return total / count;
    };

    // Feathered leaves the rim closer to the picture it is repairing.
    expect(strayInRing(soft)).toBeLessThan(strayInRing(hard) * 0.6);
    // And both still repair the middle.
    expect(read(soft, 40, 20, 20)[0]).not.toBe(read(original, 40, 20, 20)[0]);
  });

  it("reads the picture, not its own output, where a spot touches the edge", () => {
    // Boundary samples are clamped to the canvas, so a spot flush against an
    // edge samples a pixel that is *inside* it. Reading in place would then
    // pick up a pixel this same pass had already repaired, and the repair
    // would feed on itself.
    const pixels = canvas(40, 40, (x) => [x === 0 ? 255 : 0, 0, 0]);
    healRegion(pixels, 40, 40, { x: -4, y: 10, width: 24, height: 20 }, 0);

    // The exact row, because the difference is small — three or four levels
    // out of 255 — and a loose assertion would not see it. Deterministic:
    // integer arithmetic over a fixed fixture.
    const row = [1, 2, 3, 4, 5, 6, 8].map((x) => read(pixels, 40, x, 20)[0]);
    expect(row).toEqual([187, 155, 135, 122, 107, 99, 80]);
  });

  it("says when there was nothing to do", () => {
    const pixels = canvas(10, 10, () => [1, 2, 3]);
    expect(healRegion(pixels, 10, 10, { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
    expect(healRegion(pixels, 10, 10, { x: 100, y: 100, width: 5, height: 5 })).toBe(false);
    // Under a pixel of radius is not a spot either.
    expect(healRegion(pixels, 10, 10, { x: 2, y: 2, width: 1, height: 1 })).toBe(false);
  });

  it("never reads a pixel it has already healed", () => {
    // The loop runs left to right and top to bottom. Reading its own output
    // would drag every value the way it runs, so a picture that is symmetric
    // about the centre would come back lopsided.
    const pixels = canvas(41, 41, (x) => [Math.round(Math.abs(x - 20) * 12), 0, 0]);
    healRegion(pixels, 41, 41, { x: 10, y: 10, width: 21, height: 21 }, 0);

    for (const offset of [2, 5, 8]) {
      const left = read(pixels, 41, 20 - offset, 20)[0];
      const right = read(pixels, 41, 20 + offset, 20)[0];
      expect(Math.abs(left - right), `offset ${offset}`).toBeLessThan(3);
    }
  });
});
