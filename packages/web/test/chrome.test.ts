import { describe, expect, it } from "vitest";
import { createRectLayer, createTextLayer } from "@pixen/core";
import { inspectorSectionFor, recolourPatch } from "../src/element/chrome/inspector/index.js";
import { normaliseAspectRatios, ratioLabel, ratiosEqual } from "../src/element/ratios.js";
import { DEFAULT_ASPECT_RATIOS, TOOL_META } from "../src/element/constants.js";
import { DEFAULT_TOOLS } from "../src/tools/index.js";

describe("inspectorSectionFor", () => {
  it("shows the adjustment panel whenever it is open, whatever the tool", () => {
    expect(inspectorSectionFor({ panel: "adjust", tool: "crop", hasSelection: false })).toBe("adjustments");
    expect(inspectorSectionFor({ panel: "adjust", tool: "text", hasSelection: true })).toBe("adjustments");
  });

  it("shows crop options for the crop tool", () => {
    expect(inspectorSectionFor({ panel: "tool", tool: "crop", hasSelection: false })).toBe("crop");
  });

  it("shows the layer editor only when something is selected", () => {
    expect(inspectorSectionFor({ panel: "tool", tool: "select", hasSelection: true })).toBe("layer");
    expect(inspectorSectionFor({ panel: "tool", tool: "select", hasSelection: false })).toBe("select-hint");
  });

  it("hints at what to do for the text tool, which needs a click first", () => {
    expect(inspectorSectionFor({ panel: "tool", tool: "text", hasSelection: false })).toBe("text-hint");
  });

  it("offers the redaction modes whenever the redact tool is active", () => {
    expect(inspectorSectionFor({ panel: "tool", tool: "redact", hasSelection: false })).toBe("redaction");
  });

  it("edits a selected redaction wherever it was selected from", () => {
    expect(
      inspectorSectionFor({ panel: "tool", tool: "select", hasSelection: true, redactionSelected: true }),
    ).toBe("redaction");
    expect(inspectorSectionFor({ panel: "tool", tool: "crop", hasSelection: true, redactionSelected: true })).toBe(
      "redaction",
    );
  });

  it("still puts the adjustment panel first", () => {
    expect(
      inspectorSectionFor({ panel: "adjust", tool: "select", hasSelection: true, redactionSelected: true }),
    ).toBe("adjustments");
  });

  it("falls back to the annotation style for the drawing tools", () => {
    for (const tool of ["rect", "ellipse", "arrow", "draw"] as const) {
      expect(inspectorSectionFor({ panel: "tool", tool, hasSelection: false })).toBe("style");
    }
  });
});

describe("recolourPatch", () => {
  it("recolours text through its colour", () => {
    const layer = createTextLayer({ x: 0, y: 0 }, "hi");
    expect(recolourPatch(layer, "#123456")).toEqual({ color: "#123456" });
  });

  it("recolours a filled shape through its fill — the redaction case", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 1, height: 1 }, { stroke: null, fill: "#000" });
    expect(recolourPatch(layer, "#123456")).toEqual({ fill: "#123456" });
  });

  it("recolours an outlined shape through its stroke, keeping the width", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 1, height: 1 });
    expect(recolourPatch(layer, "#123456")).toEqual({
      stroke: { ...layer.stroke, color: "#123456" },
    });
  });

  it("returns an empty patch for a layer with neither", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 1, height: 1 }, { stroke: null, fill: null });
    expect(recolourPatch(layer, "#123456")).toEqual({});
  });
});

describe("aspect ratios", () => {
  it("compares ratios through float noise", () => {
    expect(ratiosEqual(16 / 9, 1.7777777)).toBe(true);
    expect(ratiosEqual(1, 1.5)).toBe(false);
    expect(ratiosEqual(null, null)).toBe(true);
    expect(ratiosEqual(null, 1)).toBe(false);
  });

  it("labels the ratios a host is likely to pass", () => {
    expect(ratioLabel(null)).toBe("Free");
    expect(ratioLabel(16 / 9)).toBe("16:9");
    expect(ratioLabel(9 / 16)).toBe("9:16");
    expect(ratioLabel(1.85)).toBe("1.85");
  });

  it("falls back to the default set", () => {
    expect(normaliseAspectRatios(null)).toEqual([...DEFAULT_ASPECT_RATIOS]);
    expect(normaliseAspectRatios([])).toEqual([...DEFAULT_ASPECT_RATIOS]);
  });

  it("labels bare numbers and passes described options through", () => {
    expect(normaliseAspectRatios([1, null, { label: "Cover", value: 3 }])).toEqual([
      { label: "1:1", value: 1 },
      { label: "Free", value: null },
      { label: "Cover", value: 3 },
    ]);
  });
});

describe("tool metadata", () => {
  it("describes every shipped tool", () => {
    for (const tool of DEFAULT_TOOLS) {
      expect(TOOL_META[tool.id], tool.id).toBeDefined();
    }
  });

  it("gives every tool a distinct shortcut", () => {
    const shortcuts = Object.values(TOOL_META).map((meta) => meta.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});
