/**
 * The three operations that read the canvas back and write it again.
 *
 * They are one function now — `editPixels` — and no unit test touched it:
 * deleting the write-back entirely left all 1173 of them, and all 14 visual
 * goldens, green. The browser suite did catch it, in the two tests that drive a
 * real retouch and a real colour matrix, so the guarantee was there; it cost a
 * minute and a built playground to get, and said nothing about the third
 * caller. A browser without `ctx.filter` is the one that loses every adjustment
 * while the export keeps them, and no suite here runs in such a browser.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ADJUSTMENTS, type Adjustments } from "@pixen/core";
import { IDENTITY } from "../src/geometry/matrix.js";
import { adjustPixels, editPixels, transformColours } from "../src/render/canvas2d/pixels.js";
import { healSpot } from "../src/render/canvas2d/retouch.js";

const WHITE = 255;
const SIZE = 8;

/** A canvas that is only its pixels, so a test can read them back. */
function canvas(width = SIZE, height = SIZE) {
  const buffer = new Uint8ClampedArray(width * height * 4).fill(WHITE);
  let reads = 0;
  let writes = 0;

  const at = (x: number, y: number) => {
    const start = (y * width + x) * 4;
    return [buffer[start]!, buffer[start + 1]!, buffer[start + 2]!] as const;
  };

  const context = {
    canvas: { width, height },
    setTransform() {},
    getImageData(x: number, y: number, w: number, h: number) {
      reads += 1;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row += 1) {
        const from = ((y + row) * width + x) * 4;
        data.set(buffer.subarray(from, from + w * 4), row * w * 4);
      }
      return { data, width: w, height: h };
    },
    putImageData(image: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) {
      writes += 1;
      for (let row = 0; row < image.height; row += 1) {
        const to = ((y + row) * width + x) * 4;
        buffer.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), to);
      }
    },
  };

  const paint = (x: number, y: number, colour: readonly [number, number, number]) => {
    const start = (y * width + x) * 4;
    buffer.set([...colour, WHITE], start);
  };

  return { context: context as never, at, paint, counts: () => ({ reads, writes }) };
}

/** A canvas the page is not allowed to read, which is what a taint looks like. */
const taintedCanvas = () => ({
  canvas: { width: SIZE, height: SIZE },
  setTransform() {},
  getImageData() {
    throw new Error("tainted");
  },
  putImageData() {
    throw new Error("should not be reached");
  },
});

const whole = { x: 0, y: 0, width: SIZE, height: SIZE };

describe("editPixels", () => {
  it("writes the edited pixels back", () => {
    const target = canvas();
    const written = editPixels(target.context, whole, (pixels) => {
      pixels[0] = 0;
      return true;
    });

    expect(written).toBe(true);
    expect(target.at(0, 0)[0]).toBe(0);
  });

  it("writes nothing back when the edit changed nothing", () => {
    const target = canvas();
    // An edit may touch the buffer and still report no change; what decides is
    // the answer, because putting a megapixel back costs the same either way.
    const written = editPixels(target.context, whole, (pixels) => {
      pixels[0] = 0;
      return false;
    });

    expect(written).toBe(false);
    expect(target.counts().writes).toBe(0);
    expect(target.at(0, 0)[0]).toBe(WHITE);
  });

  it("reads and writes the region it was given, not the whole canvas", () => {
    const target = canvas();
    const region = { x: 2, y: 3, width: 2, height: 2 };
    editPixels(target.context, region, (pixels, width, height) => {
      expect([width, height]).toEqual([2, 2]);
      pixels.fill(0);
      return true;
    });

    expect(target.at(2, 3)).toEqual([0, 0, 0]);
    expect(target.at(3, 4)).toEqual([0, 0, 0]);
    // One pixel outside each edge of it.
    expect(target.at(1, 3)[0]).toBe(WHITE);
    expect(target.at(4, 4)[0]).toBe(WHITE);
  });

  it("says so, and leaves the picture alone, when the canvas cannot be read", () => {
    // The caller decides what that means. The retouch brush leaves the blemish;
    // the redaction, which does not come through here, paints solid instead.
    expect(editPixels(taintedCanvas() as never, whole, () => true)).toBe(false);
  });

  it("does not read an empty region", () => {
    const target = canvas();
    expect(editPixels(target.context, { x: 0, y: 0, width: 0, height: 4 }, () => true)).toBe(false);
    expect(target.counts().reads).toBe(0);
  });
});

describe("the operations that go through it", () => {
  const adjustments = (over: Partial<Adjustments>): Adjustments => ({ ...DEFAULT_ADJUSTMENTS, ...over });

  it("puts the pixel adjustment fallback on the canvas", () => {
    const target = canvas();
    target.paint(0, 0, [100, 100, 100]);
    adjustPixels(target.context, { op: "adjust-pixels", width: SIZE, height: SIZE, adjustments: adjustments({ brightness: 0.5 }) } as never);

    expect(target.at(0, 0)[0]).toBe(150);
  });

  it("puts the host's colour transform on the canvas", () => {
    const target = canvas();
    target.paint(1, 1, [100, 100, 100]);
    // Red doubled, the other channels left alone.
    const matrix = [2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    transformColours(target.context, { op: "colour-matrix", width: SIZE, height: SIZE, matrix } as never);

    expect(target.at(1, 1)).toEqual([200, 100, 100]);
  });

  it("puts the repaired spot on the canvas, and only the spot", () => {
    const target = canvas();
    target.paint(4, 4, [0, 0, 0]);
    healSpot(
      target.context,
      { op: "heal", frame: { x: 3, y: 3, width: 3, height: 3 }, feather: 0.25 } as never,
      IDENTITY,
    );

    // The blemish took the colour of what surrounds it.
    expect(target.at(4, 4)[0]).toBeGreaterThan(200);
    expect(target.at(0, 0)[0]).toBe(WHITE);
  });
});
