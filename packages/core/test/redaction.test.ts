import { describe, expect, it } from "vitest";
import { obscureRegion, obscureStrength } from "../src/render/canvas2d/redaction.js";
import { compose, rotation, scaling, IDENTITY } from "../src/geometry/matrix.js";
import { buildSceneOps, createDocument, createRedactLayer, createScene } from "@pixen/core";

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

/**
 * A redaction has to hide the same amount on screen as in the file.
 *
 * Its strength is a fraction of the image's longest edge, and the scene used to
 * hand the builder the *stand-in's* size instead — so a picture large enough to
 * be proxied was blurred against a quarter-size bitmap and came out four times
 * too weak on screen while the exported file was right. `docs/SECURITY.md`
 * promises the preview and the export agree; this is that promise, measured.
 */
describe("what a redaction is measured against", () => {
  const marked = () => {
    const document = createDocument({ resourceId: "res_1", width: 2000, height: 1000 });
    return {
      ...document,
      layers: [createRedactLayer({ x: 100, y: 100, width: 400, height: 200 }, { mode: "blur", strength: 0.02 })],
    };
  };

  const strengthOf = (source: CanvasImageSource) => {
    const ops = buildSceneOps(createScene(marked(), { source }, { region: "crop" }));
    const op = ops.find((candidate) => candidate.op === "obscure") as { strength: number };
    return op.strength;
  };

  it("is the picture's own size, whatever bitmap stood in for it", () => {
    // A quarter-size proxy and the full bitmap are the same picture, so they
    // are the same redaction.
    const full = { width: 2000, height: 1000 } as unknown as CanvasImageSource;
    const proxy = { width: 500, height: 250 } as unknown as CanvasImageSource;
    expect(strengthOf(proxy)).toBe(strengthOf(full));
    // A fortieth of two thousand: the fraction resolved against the document.
    expect(strengthOf(full)).toBe(40);
  });
});
