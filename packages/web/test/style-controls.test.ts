import { describe, expect, it } from "vitest";
import { styleControlsFor } from "../src/element/chrome/inspector/style-controls.js";
import { cornerRadiusFor, DEFAULT_STYLE, strokeFor } from "../src/tools/style.js";

describe("styleControlsFor", () => {
  it("offers a fill and a corner radius to a rectangle", () => {
    expect(styleControlsFor({ tool: "rect" })).toEqual(["colour", "fill", "width", "dash", "corner"]);
  });

  it("offers a fill but no corners to an ellipse", () => {
    expect(styleControlsFor({ tool: "ellipse" })).toEqual(["colour", "fill", "width", "dash"]);
  });

  it("offers arrow heads only to a line", () => {
    expect(styleControlsFor({ tool: "arrow" })).toContain("arrowEnds");
    expect(styleControlsFor({ tool: "draw" })).not.toContain("arrowEnds");
  });

  it("offers type controls to text and no stroke width", () => {
    const controls = styleControlsFor({ tool: "text" });
    expect(controls).toEqual(["colour", "fontSize", "align", "textPlate"]);
    expect(controls).not.toContain("width");
  });

  it("offers nothing to a bitmap, which has no colour of its own", () => {
    expect(styleControlsFor({ tool: "select", layerType: "image" })).toEqual([]);
  });

  it("leaves a redaction to its own section", () => {
    expect(styleControlsFor({ tool: "redact" })).toEqual([]);
  });

  it("offers nothing for tools that draw nothing", () => {
    expect(styleControlsFor({ tool: "crop" })).toEqual([]);
    expect(styleControlsFor({ tool: "sticker" })).toEqual([]);
  });

  it("lets the selection outrank the tool", () => {
    // Selecting text with the select tool active must show the text controls,
    // not the ones the tool would draw with.
    expect(styleControlsFor({ tool: "select", layerType: "text" })).toContain("fontSize");
    expect(styleControlsFor({ tool: "rect", layerType: "text" })).toContain("fontSize");
  });
});

describe("stroke style", () => {
  it("is solid unless dashes were asked for", () => {
    expect(strokeFor(DEFAULT_STYLE, 1000).dash).toBeUndefined();
  });

  it("measures dashes in stroke widths, so they scale with the line", () => {
    const thin = strokeFor({ ...DEFAULT_STYLE, dashed: true }, 1000);
    const thick = strokeFor({ ...DEFAULT_STYLE, dashed: true }, 4000);
    expect(thin.dash![0] / thin.width).toBeCloseTo(thick.dash![0] / thick.width);
  });

  it("rounds a rectangle by a fraction of its shorter side", () => {
    const style = { ...DEFAULT_STYLE, cornerRatio: 0.25 };
    expect(cornerRadiusFor(style, { width: 400, height: 200 })).toBe(50);
    expect(cornerRadiusFor(DEFAULT_STYLE, { width: 400, height: 200 })).toBe(0);
  });
});
