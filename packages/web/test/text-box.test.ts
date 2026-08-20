import { describe, expect, it } from "vitest";
import { createTextLayer, IDENTITY, compose, scaling, translation } from "@pixen/core";
import { LINE_HEIGHT_RATIO } from "@pixen/core";
import { MIN_TEXT_BOX_WIDTH, textBoxPlacement, textBoxStyle } from "../src/viewport/text-box.js";

const layer = () =>
  createTextLayer({ x: 100, y: 50 }, "one\ntwo", { fontSize: 40, color: "#ff0000", fontFamily: "serif" });

describe("textBoxPlacement", () => {
  it("puts the box where the text starts", () => {
    const placement = textBoxPlacement(layer(), IDENTITY);
    expect(placement.left).toBe(100);
    expect(placement.top).toBe(50);
  });

  it("follows the view, so the editor tracks a pan and a zoom", () => {
    const view = compose(translation(10, 20), scaling(2));
    const placement = textBoxPlacement(layer(), view);
    expect(placement.left).toBe(210);
    expect(placement.top).toBe(120);
    expect(placement.fontSize).toBe(80);
  });

  it("matches the renderer's line spacing, or the caret drifts down a paragraph", () => {
    expect(textBoxPlacement(layer(), IDENTITY).lineHeight).toBeCloseTo(40 * LINE_HEIGHT_RATIO);
  });

  it("turns about the centre the renderer turns about, not about the corner", () => {
    const rotated = { ...layer(), rotation: Math.PI / 4 };
    const placement = textBoxPlacement(rotated, IDENTITY);
    expect(placement.rotation).toBeCloseTo(Math.PI / 4);
    // Two lines at the renderer's own spacing, so the centre is one line down.
    // Read from the constant, not written out: a number copied here is how the
    // editor and the renderer came to space paragraphs differently.
    expect(placement.origin.y).toBeCloseTo(40 * LINE_HEIGHT_RATIO);
    expect(placement.origin.x).toBeGreaterThan(0);
  });

  it("carries the layer's own type, colour and alignment", () => {
    const placement = textBoxPlacement(layer(), IDENTITY);
    expect(placement.fontFamily).toBe("serif");
    expect(placement.color).toBe("#ff0000");
    expect(placement.align).toBe("left");
  });

  it("has no width of its own until the layer wraps", () => {
    expect(textBoxPlacement(layer(), IDENTITY).maxWidth).toBeNull();
    const wrapped = { ...layer(), maxWidth: 300 };
    expect(textBoxPlacement(wrapped, scaling(2)).maxWidth).toBe(600);
  });

  it("stays wide enough to show a caret in an empty layer", () => {
    const empty = { ...layer(), text: "", maxWidth: 1 };
    expect(textBoxPlacement(empty, IDENTITY).maxWidth).toBe(MIN_TEXT_BOX_WIDTH);
  });
});

describe("textBoxStyle", () => {
  it("is the placement in CSS, with no transform when nothing is turned", () => {
    const style = textBoxStyle(textBoxPlacement(layer(), IDENTITY));
    expect(style.left).toBe("100px");
    expect(style["font-size"]).toBe("40px");
    expect(style.transform).toBe("none");
    expect(style.width).toBe("auto");
  });

  it("rotates in radians about the placed origin", () => {
    const style = textBoxStyle(textBoxPlacement({ ...layer(), rotation: 1 }, IDENTITY));
    expect(style.transform).toBe("rotate(1rad)");
    expect(style["transform-origin"]).toMatch(/px .*px/);
  });
});
