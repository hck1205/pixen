import { describe, expect, it } from "vitest";
import { obscureRegion, obscureStrength } from "../src/render/canvas2d/redaction.js";
import { compose, rotation, scaling, IDENTITY } from "../src/geometry/matrix.js";

const STRENGTH = 40;

describe("obscureStrength", () => {
  it("is the strength itself when nothing is scaled", () => {
    expect(obscureStrength(STRENGTH, IDENTITY)).toBeCloseTo(STRENGTH, 6);
  });

  it("follows the scale, because the region it covers does", () => {
    expect(obscureStrength(STRENGTH, scaling(0.5, 0.5))).toBeCloseTo(STRENGTH / 2, 6);
  });

  /**
   * The one that matters. A rotation does not make a picture smaller, so it must
   * not make a redaction weaker — and a redaction that is quietly weaker than
   * asked for is the worst kind, because nothing on screen says so.
   */
  it("is unchanged by a rotation, at every angle", () => {
    for (const radians of [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, 2.4, -1.1]) {
      expect(obscureStrength(STRENGTH, rotation(radians)), `${radians} rad`).toBeCloseTo(STRENGTH, 6);
    }
  });

  it("follows the scale through a rotation, not instead of it", () => {
    const view = compose(scaling(2, 2), rotation(Math.PI / 4));
    expect(obscureStrength(STRENGTH, view)).toBeCloseTo(STRENGTH * 2, 6);
  });
});

/**
 * The promise `docs/SECURITY.md` makes about every mode: it falls back to the
 * solid fill rather than painting nothing, "because a redaction that quietly
 * does nothing is the one outcome that must never happen".
 *
 * Until now that sentence was the whole of the guarantee — `obscureRegion` was
 * imported by no test at all. It is checked here against a context that refuses
 * every way of reading or copying pixels, which is the shape of a tainted canvas
 * and of an engine with no filter.
 */
function refusingContext() {
  const filled: Array<{ style: unknown; rect: number[] }> = [];
  const context = {
    canvas: { width: 200, height: 200 },
    fillStyle: "" as unknown,
    fillRect(x: number, y: number, width: number, height: number) {
      filled.push({ style: context.fillStyle, rect: [x, y, width, height] });
    },
    drawImage() {
      throw new Error("tainted");
    },
    getImageData() {
      throw new Error("tainted");
    },
  };
  return { context, filled };
}

const obscure = (mode: string, frame = { x: 10, y: 10, width: 40, height: 30 }) =>
  ({ op: "obscure", mode, frame, strength: 8, colour: "#123456", seed: 1 }) as never;

describe("obscureRegion falls back rather than painting nothing", () => {
  for (const mode of ["blur", "pixelate", "scramble"]) {
    it(`paints the solid fill when \`${mode}\` cannot reach the pixels`, () => {
      const { context, filled } = refusingContext();
      obscureRegion(context as never, obscure(mode), IDENTITY);

      expect(filled).toHaveLength(1);
      expect(filled[0]!.style).toBe("#123456");
      expect(filled[0]!.rect).toEqual([10, 10, 40, 30]);
    });
  }

  it("still paints solid directly, without touching the pixels at all", () => {
    const { context, filled } = refusingContext();
    obscureRegion(context as never, obscure("solid"), IDENTITY);
    expect(filled).toHaveLength(1);
  });
});
