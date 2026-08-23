import { describe, expect, it } from "vitest";
import {
  applyToPoint,
  lineEndInset,
  buildSceneOps,
  commands,
  createArrowLayer,
  createDocument,
  createEllipseLayer,
  createLineLayer,
  createPathLayer,
  createRectLayer,
  createScene,
  createTextLayer,
  cssFilter,
  ellipseLayerOps,
  estimateTextWidth,
  layerOps,
  layerRotationCentre,
  lineLayerOps,
  LINE_HEIGHT_RATIO,
  pathLayerOps,
  rectLayerOps,
  textLayerOps,
  withLayerRotation,
  wrapLines,
  IDENTITY,
  type DrawOp,
} from "@pixen/core";

/** Ten units per character: predictable, so layout assertions are exact. */
const measure = (text: string) => text.length * 10;
const source = { width: 1000, height: 500 } as unknown as CanvasImageSource;

function document() {
  return createDocument({ resourceId: "res_1", width: 1000, height: 500 });
}

function kinds(ops: readonly DrawOp[]): string[] {
  return ops.map((op) => op.op);
}

function pathOp(ops: readonly DrawOp[], index = 0): Extract<DrawOp, { op: "path" }> {
  const found = ops.filter((op) => op.op === "path")[index];
  if (!found || found.op !== "path") throw new Error("expected a path op");
  return found;
}

describe("rect layer", () => {
  it("emits a plain rect with its stroke", () => {
    const ops = rectLayerOps(createRectLayer({ x: 1, y: 2, width: 30, height: 40 }));
    const path = pathOp(ops);
    expect(path.commands).toEqual([{ op: "rect", rect: { x: 1, y: 2, width: 30, height: 40 } }]);
    expect(path.stroke).toMatchObject({ width: 8, dash: [] });
    expect(path.fill).toBeUndefined();
  });

  it("switches to a rounded rect when a corner radius is set", () => {
    const ops = rectLayerOps(createRectLayer({ x: 0, y: 0, width: 100, height: 80 }, { cornerRadius: 12 }));
    expect(pathOp(ops).commands[0]).toEqual({
      op: "round-rect",
      rect: { x: 0, y: 0, width: 100, height: 80 },
      radius: 12,
    });
  });

  it("clamps the radius to half the shorter side", () => {
    const ops = rectLayerOps(createRectLayer({ x: 0, y: 0, width: 100, height: 20 }, { cornerRadius: 999 }));
    expect(pathOp(ops).commands[0]).toMatchObject({ op: "round-rect", radius: 10 });
  });

  it("carries a fill and drops the stroke when there is none — the redaction mask", () => {
    const ops = rectLayerOps(
      createRectLayer({ x: 0, y: 0, width: 10, height: 10 }, { stroke: null, fill: "#12161c" }),
    );
    expect(pathOp(ops).fill).toBe("#12161c");
    expect(pathOp(ops).stroke).toBeUndefined();
  });
});

describe("ellipse layer", () => {
  it("is inscribed in its frame", () => {
    const ops = ellipseLayerOps(createEllipseLayer({ x: 10, y: 20, width: 100, height: 60 }));
    expect(pathOp(ops).commands[0]).toEqual({
      op: "ellipse",
      centre: { x: 60, y: 50 },
      radiusX: 50,
      radiusY: 30,
    });
  });
});

describe("line and arrow layers", () => {
  it("draws a bare shaft with no heads", () => {
    const ops = lineLayerOps(createLineLayer({ x: 0, y: 0 }, { x: 100, y: 0 }));
    expect(kinds(ops)).toEqual(["path"]);
    expect(pathOp(ops).commands).toEqual([
      { op: "move", to: { x: 0, y: 0 } },
      { op: "line", to: { x: 100, y: 0 } },
    ]);
  });

  it("insets the shaft and adds a head for an arrow", () => {
    const layer = createArrowLayer({ x: 0, y: 0 }, { x: 200, y: 0 });
    const ops = lineLayerOps(layer);
    expect(kinds(ops)).toEqual(["path", "path"]);

    const inset = lineEndInset("arrow-solid", layer.stroke.width);
    expect(pathOp(ops).commands[1]).toEqual({ op: "line", to: { x: 200 - inset, y: 0 } });
    expect(pathOp(ops, 1).fill).toBe(layer.stroke.color);
  });

  it("puts a decoration on both ends when asked", () => {
    const ops = lineLayerOps(
      createLineLayer({ x: 0, y: 0 }, { x: 200, y: 0 }, { startStyle: "circle", endStyle: "arrow-solid" }),
    );
    expect(kinds(ops)).toEqual(["path", "path", "path"]);
  });

  it("never insets more than half a short line", () => {
    const layer = createArrowLayer({ x: 0, y: 0 }, { x: 4, y: 0 });
    const shaft = pathOp(lineLayerOps(layer));
    expect((shaft.commands[1] as { to: { x: number } }).to.x).toBeCloseTo(2);
  });

  it("stops the shaft at the middle of a short line with two decorations", () => {
    // Two insets on a line shorter than both of them would leave a shaft
    // running backwards, which draws as nothing on some engines and as a
    // stray mark on others.
    const layer = createLineLayer({ x: 0, y: 0 }, { x: 4, y: 0 }, { startStyle: "circle", endStyle: "arrow-solid" });
    const shaft = pathOp(lineLayerOps(layer));
    expect((shaft.commands[0] as { to: { x: number } }).to.x).toBeCloseTo(2);
    expect((shaft.commands[1] as { to: { x: number } }).to.x).toBeCloseTo(2);
  });
});

describe("path layer", () => {
  it("renders a single sample as a dot", () => {
    const ops = pathLayerOps(createPathLayer([{ x: 5, y: 5 }]));
    expect(pathOp(ops).commands).toEqual([{ op: "circle", centre: { x: 5, y: 5 }, radius: 4 }]);
    expect(pathOp(ops).fill).toBeDefined();
  });

  it("smooths through sample midpoints", () => {
    const ops = pathLayerOps(
      createPathLayer([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
      ]),
    );
    expect(pathOp(ops).commands).toEqual([
      { op: "move", to: { x: 0, y: 0 } },
      { op: "quad", control: { x: 10, y: 10 }, to: { x: 15, y: 5 } },
      { op: "line", to: { x: 20, y: 0 } },
    ]);
  });

  it("closes a closed path", () => {
    const ops = pathLayerOps(
      createPathLayer(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        { closed: true },
      ),
    );
    expect(pathOp(ops).commands.at(-1)).toEqual({ op: "close" });
  });

  it("emits nothing for an empty path", () => {
    expect(pathLayerOps(createPathLayer([]))).toEqual([]);
  });
});

describe("text layout", () => {
  it("keeps explicit newlines and ignores wrapping without a max width", () => {
    expect(wrapLines("one\ntwo", null, "20px sans", measure)).toEqual(["one", "two"]);
  });

  it("wraps greedily at the max width", () => {
    expect(wrapLines("aaa bbb ccc", 70, "20px sans", measure)).toEqual(["aaa bbb", "ccc"]);
  });

  it("never drops a word that cannot fit on its own", () => {
    expect(wrapLines("supercalifragilistic", 10, "20px sans", measure)).toEqual(["supercalifragilistic"]);
  });

  it("wraps each paragraph independently", () => {
    expect(wrapLines("aaa bbb\nccc ddd", 70, "20px sans", measure)).toEqual(["aaa bbb", "ccc ddd"]);
  });

  it("places a left-aligned block at its own position", () => {
    const ops = textLayerOps(createTextLayer({ x: 100, y: 50 }, "hey", { fontSize: 40 }), measure);
    expect(ops[0]).toMatchObject({
      op: "text",
      origin: { x: 100, y: 50 },
      lineHeight: 40 * LINE_HEIGHT_RATIO,
      align: "left",
    });
  });

  it("moves the anchor to the middle when centred", () => {
    const ops = textLayerOps(createTextLayer({ x: 0, y: 0 }, "abcd", { align: "center" }), measure);
    // Four characters at ten units each; the anchor sits at half the width.
    expect(ops[0]).toMatchObject({ origin: { x: 20 } });
  });

  it("moves the anchor to the end when right aligned", () => {
    const ops = textLayerOps(createTextLayer({ x: 0, y: 0 }, "abcd", { align: "right" }), measure);
    expect(ops[0]).toMatchObject({ origin: { x: 40 } });
  });

  it("pads a background box around the widest line", () => {
    const ops = textLayerOps(
      createTextLayer({ x: 0, y: 0 }, "ab\nabcd", { fontSize: 10, backgroundColor: "#000" }),
      measure,
    );
    const op = ops[0] as Extract<DrawOp, { op: "text" }>;
    expect(op.background).toEqual({
      color: "#000",
      rect: { x: -2, y: -2, width: 44, height: 29 },
    });
  });

  it("estimates a width when no measurer is available", () => {
    expect(estimateTextWidth("abcd", "20px sans")).toBeCloseTo(4 * 20 * 0.55);
  });
});

describe("layer transforms", () => {
  it("prefixes every layer with its opacity and matrix", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 10, height: 10 }, { opacity: 0.4 });
    const ops = layerOps({ layer, matrix: IDENTITY, scale: 1 }, measure);
    expect(kinds(ops)).toEqual(["alpha", "transform", "path"]);
    expect(ops[0]).toEqual({ op: "alpha", value: 0.4 });
  });

  it("rotates around the shape's own centre", () => {
    const centre = { x: 50, y: 50 };
    const rotated = withLayerRotation(IDENTITY, Math.PI / 2, centre);
    const atCentre = applyToPoint(rotated, centre);
    expect(atCentre.x).toBeCloseTo(50);
    expect(atCentre.y).toBeCloseTo(50);

    const corner = applyToPoint(rotated, { x: 100, y: 50 });
    expect(corner.x).toBeCloseTo(50);
    expect(corner.y).toBeCloseTo(100);
  });

  it("leaves the matrix untouched when there is no rotation", () => {
    expect(withLayerRotation(IDENTITY, 0, { x: 1, y: 1 })).toBe(IDENTITY);
  });

  it("finds a rotation centre for every layer type", () => {
    expect(layerRotationCentre(createRectLayer({ x: 0, y: 0, width: 10, height: 20 }), measure)).toEqual({
      x: 5,
      y: 10,
    });
    expect(layerRotationCentre(createLineLayer({ x: 0, y: 0 }, { x: 10, y: 20 }), measure)).toEqual({ x: 5, y: 10 });
    expect(
      layerRotationCentre(
        createPathLayer([
          { x: 0, y: 0 },
          { x: 10, y: 4 },
        ]),
        measure,
      ),
    ).toEqual({ x: 5, y: 2 });
  });

  it("survives a path layer with no points", () => {
    expect(layerRotationCentre(createPathLayer([]), measure)).toEqual({ x: 0, y: 0 });
  });
});

describe("buildSceneOps", () => {
  const scene = () => createScene(document(), { source });

  it("clears, draws the image, and stops there for a bare document", () => {
    expect(kinds(buildSceneOps(scene(), { measureText: measure }))).toEqual([
      "clear",
      "alpha",
      "transform",
      "image",
    ]);
  });

  it("skips the clear when compositing", () => {
    expect(kinds(buildSceneOps(scene(), { clear: false, measureText: measure }))).not.toContain("clear");
  });

  it("paints a background under the image when one is set", () => {
    const withBackground = createScene(commands.setOutput(document(), { background: "#fff" }), { source });
    const ops = buildSceneOps(withBackground, { measureText: measure });
    expect(kinds(ops).slice(0, 2)).toEqual(["clear", "fill-viewport"]);
  });

  it("wraps the image draw in a filter when the engine supports one", () => {
    const adjusted = createScene(commands.setAdjustments(document(), { contrast: 0.5 }), { source });
    const ops = buildSceneOps(adjusted, { contextFilter: true, measureText: measure });
    expect(kinds(ops)).toEqual(["clear", "filter", "alpha", "transform", "image", "filter"]);
    expect(ops[1]).toEqual({ op: "filter", value: "contrast(1.5)" });
    expect(ops.at(-1)).toEqual({ op: "filter", value: "none" });
  });

  it("falls back to a pixel pass when it does not", () => {
    const adjusted = createScene(commands.setAdjustments(document(), { contrast: 0.5 }), { source });
    const ops = buildSceneOps(adjusted, { contextFilter: false, measureText: measure });
    expect(kinds(ops)).toEqual(["clear", "alpha", "transform", "image", "adjust-pixels"]);
    expect(ops.at(-1)).toMatchObject({ adjustments: { contrast: 0.5, brightness: 0, saturation: 0 } });
  });

  it("adds no adjustment work when nothing is adjusted", () => {
    expect(kinds(buildSceneOps(scene(), { contextFilter: false }))).not.toContain("adjust-pixels");
  });

  it("appends each visible layer after the image", () => {
    const withLayers = commands.addLayer(document(), createRectLayer({ x: 0, y: 0, width: 5, height: 5 }));
    const ops = buildSceneOps(createScene(withLayers, { source }), { measureText: measure });
    expect(kinds(ops)).toEqual(["clear", "alpha", "transform", "image", "alpha", "transform", "path"]);
  });

  it("can leave the layers out, for a crop preview", () => {
    const withLayers = commands.addLayer(document(), createRectLayer({ x: 0, y: 0, width: 5, height: 5 }));
    const ops = buildSceneOps(createScene(withLayers, { source }), { skipLayers: true });
    expect(kinds(ops)).toEqual(["clear", "alpha", "transform", "image"]);
  });
});

describe("the pixel fallback", () => {
  it("carries the document's own values, not values re-read from a string", () => {
    // The filter string is lossy — the chain can emit two brightness() calls —
    // so the scene hands the renderer the numbers it started from.
    const adjusted = commands.setAdjustments(document(), { exposure: 1, sepia: 0.4 });
    const ops = buildSceneOps(createScene(adjusted, { source }), { contextFilter: false });
    const pixels = ops.find((op) => op.op === "adjust-pixels");
    expect(pixels).toMatchObject({ adjustments: { exposure: 1, sepia: 0.4 } });
  });

  it("draws a vignette over the image and under the annotations", () => {
    const withLayer = commands.addLayer(
      commands.setAdjustments(document(), { vignette: 0.5 }),
      createRectLayer({ x: 0, y: 0, width: 50, height: 50 }),
    );
    const ops = buildSceneOps(createScene(withLayer, { source }));
    const order = kinds(ops);
    expect(order.indexOf("vignette")).toBeGreaterThan(order.indexOf("image"));
    expect(order.indexOf("vignette")).toBeLessThan(order.lastIndexOf("path"));
  });

  it("leaves the vignette out when it is neutral", () => {
    const ops = buildSceneOps(createScene(document(), { source }));
    expect(kinds(ops)).not.toContain("vignette");
  });
});
