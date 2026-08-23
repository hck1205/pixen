import { describe, expect, it } from "vitest";
import type { EditorLayer } from "@pixen/core";
import { styleControlsFor, styleTarget } from "../src/element/chrome/inspector/style-controls.js";
import { cornerRadiusFor, DEFAULT_STYLE, strokeFor } from "../src/tools/style.js";

describe("styleControlsFor", () => {
  it("offers a fill and a corner radius to a rectangle", () => {
    expect(styleControlsFor({ tool: "rect" })).toEqual(["colour", "fill", "width", "dash", "corner"]);
  });

  it("offers a fill but no corners to an ellipse", () => {
    expect(styleControlsFor({ tool: "ellipse" })).toEqual(["colour", "fill", "width", "dash"]);
  });

  it("offers line ends only to a line", () => {
    expect(styleControlsFor({ tool: "arrow" })).toContain("lineEnds");
    expect(styleControlsFor({ tool: "draw" })).not.toContain("lineEnds");
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

/**
 * Which layer a style control is allowed to patch.
 *
 * Arming a tool does not clear the selection, and the style section is built
 * from the tool alone — so a rectangle stays selected while the text tool puts
 * up the alignment buttons. Pressing one wrote `align` onto the rectangle,
 * which `updateLayer` spreads without asking what it is patching: a field that
 * means nothing on that layer, in the document and in the undo history.
 */
describe("styleTarget", () => {
  const rect = { id: "l1", type: "rect" } as unknown as EditorLayer;
  const text = { id: "l2", type: "text" } as unknown as EditorLayer;

  it("patches the selection when the controls are about its kind", () => {
    expect(styleTarget({ tool: "rect" }, rect)).toBe(rect);
    expect(styleTarget({ tool: "text" }, text)).toBe(text);
  });

  it("patches nothing when the armed tool is about another kind", () => {
    // The text tool's alignment buttons, with a rectangle still selected.
    expect(styleTarget({ tool: "text" }, rect)).toBeNull();
    // The arrow tool's end buttons, with a text layer still selected.
    expect(styleTarget({ tool: "arrow" }, text)).toBeNull();
  });

  it("follows the selection when there is one, since it outranks the tool", () => {
    // The layer panel names the kind, and then the tool is beside the point.
    expect(styleTarget({ tool: "text", layerType: "rect" }, rect)).toBe(rect);
    expect(styleTarget({ tool: "rect", layerType: "rect" }, text)).toBeNull();
  });

  it("patches nothing for a tool that draws no layer at all", () => {
    expect(styleTarget({ tool: "crop" }, rect)).toBeNull();
    expect(styleTarget({ tool: "select" }, rect)).toBeNull();
  });

  it("patches nothing when nothing is selected", () => {
    expect(styleTarget({ tool: "rect" }, null)).toBeNull();
  });
});
