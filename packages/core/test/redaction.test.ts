import { describe, expect, it } from "vitest";
import { obscureStrength } from "../src/render/canvas2d/index.js";
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
