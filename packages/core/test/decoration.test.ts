import { describe, expect, it } from "vitest";
import {
  buildSceneOps,
  commands,
  createDocument,
  createScene,
  createTextWatermarkLayer,
  DEFAULT_FRAME,
  DEFAULT_TEXT_WATERMARK_SCALE,
  frameOp,
  isErr,
  isOk,
  layerBounds,
  MAX_FRAME_WIDTH,
  migrateDocument,
  placeWithin,
  SCHEMA_VERSION,
  validators,
} from "@pixen/core";

const source = { width: 1000, height: 500 } as unknown as CanvasImageSource;
const image = { width: 1000, height: 500 };

function document() {
  return createDocument({ resourceId: "res_1", width: 1000, height: 500 });
}

function kinds(ops: Array<{ op: string }>): string[] {
  return ops.map((op) => op.op);
}

describe("placeWithin", () => {
  const size = { width: 100, height: 50 };

  it("insets a corner by the margin, measured on the longest edge", () => {
    // Margin is 0.05 of the longest edge (1000), so 50px in from each side.
    expect(placeWithin(image, size, "top-left", 0.05)).toEqual({ x: 50, y: 50, width: 100, height: 50 });
    expect(placeWithin(image, size, "bottom-right", 0.05)).toEqual({
      x: 1000 - 100 - 50,
      y: 500 - 50 - 50,
      width: 100,
      height: 50,
    });
  });

  it("centres on the axis a position does not name", () => {
    expect(placeWithin(image, size, "top", 0.05).x).toBeCloseTo((1000 - 100) / 2);
    expect(placeWithin(image, size, "left", 0.05).y).toBeCloseTo((500 - 50) / 2);
  });

  it("puts centre in the middle on both axes", () => {
    const frame = placeWithin(image, size, "centre", 0.05);
    expect(frame.x).toBeCloseTo(450);
    expect(frame.y).toBeCloseTo(225);
  });
});

describe("createTextWatermarkLayer", () => {
  it("sizes the type from the longest edge, not from the pixel count", () => {
    const small = createTextWatermarkLayer(image, { text: "© Pixen" });
    const large = createTextWatermarkLayer({ width: 4000, height: 2000 }, { text: "© Pixen" });
    expect(small.fontSize).toBeCloseTo(1000 * DEFAULT_TEXT_WATERMARK_SCALE);
    expect(large.fontSize / small.fontSize).toBeCloseTo(4);
  });

  it("lands inside the image at the margin it was given", () => {
    const layer = createTextWatermarkLayer(image, { text: "© Pixen", position: "bottom-right", margin: 0.02 });
    const bounds = layerBounds(layer);
    expect(bounds.x + bounds.width).toBeCloseTo(1000 - 20, 0);
    expect(bounds.y + bounds.height).toBeCloseTo(500 - 20, 0);
  });

  it("is a text layer, so it edits and exports like any other", () => {
    const layer = createTextWatermarkLayer(image, { text: "© Pixen", colour: "#ff0000", opacity: 0.4 });
    expect(layer.type).toBe("text");
    expect(layer.color).toBe("#ff0000");
    expect(layer.opacity).toBe(0.4);
    expect(layer.name).toBe("watermark");
  });
});

describe("frames", () => {
  it("are absent until asked for", () => {
    expect(document().frame).toBeNull();
    expect(kinds(buildSceneOps(createScene(document(), { source })))).not.toContain("frame");
  });

  it("fill in the defaults when a host sets only one field", () => {
    const framed = commands.setFrame(document(), { colour: "#101010" });
    expect(framed.frame).toEqual({ ...DEFAULT_FRAME, colour: "#101010" });
  });

  it("keep what was already set when patched again", () => {
    const framed = commands.setFrame(commands.setFrame(document(), { colour: "#101010" }), { style: "rounded" });
    expect(framed.frame).toMatchObject({ colour: "#101010", style: "rounded" });
  });

  it("clamp a width that would swallow the picture", () => {
    expect(commands.setFrame(document(), { width: 99 }).frame?.width).toBe(MAX_FRAME_WIDTH);
  });

  it("clear on null", () => {
    expect(commands.setFrame(commands.setFrame(document(), {}), null).frame).toBeNull();
  });

  it("draw over everything, annotations included", () => {
    const withLayer = commands.setFrame(
      commands.addLayer(document(), {
        id: "rect_1",
        type: "rect",
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        frame: { x: 0, y: 0, width: 10, height: 10 },
        stroke: { color: "#fff", width: 1 },
        fill: null,
        cornerRadius: 0,
      }),
      {},
    );
    // A frame under an annotation would be a frame the annotation could cover.
    const order = kinds(buildSceneOps(createScene(withLayer, { source })));
    expect(order[order.length - 1]).toBe("frame");
  });

  it("resolve their fractions against the region they are drawn around", () => {
    const region = { x: 0, y: 0, width: 2000, height: 1000 };
    const op = frameOp({ ...DEFAULT_FRAME, width: 0.01, radius: 0.02, inset: 0.03 }, region);
    // One setting has to suit a thumbnail and a 6000px export alike.
    expect(op.width).toBeCloseTo(20);
    expect(op.radius).toBeCloseTo(40);
    expect(op.inset).toBeCloseTo(60);
  });

  it("never resolve to a hairline that would vanish", () => {
    expect(frameOp({ ...DEFAULT_FRAME, width: 0 }, { x: 0, y: 0, width: 100, height: 100 }).width).toBe(1);
  });

  it("go around the picture, not around the canvas the picture floats in", () => {
    // In the viewport the render target is the whole canvas and the picture is
    // a small rect inside it; a frame drawn on the target would frame the app.
    const framed = commands.setFrame(document(), {});
    const viewport = createScene(
      framed,
      { source },
      { region: "stage", target: { width: 1400, height: 900 }, fit: "none" },
    );
    const op = buildSceneOps(viewport).find((candidate) => candidate.op === "frame")!;
    expect(op).toMatchObject({ rect: { width: 1000, height: 500 } });

    const exported = createScene(framed, { source }, { region: "crop" });
    const exportedOp = buildSceneOps(exported).find((candidate) => candidate.op === "frame")!;
    expect(exportedOp).toMatchObject({ rect: { x: 0, y: 0, width: 1000, height: 500 } });
  });
});

describe("frame validation and migration", () => {
  it("accepts a complete frame", () => {
    const result = validators.frameSettings(
      { style: "rounded", width: 0.02, colour: "#fff", radius: 0.01, inset: 0 },
      "$.frame",
    );
    expect(isOk(result)).toBe(true);
  });

  it("fills the fields an older host omitted", () => {
    const result = validators.frameSettings({ colour: "#000" }, "$.frame");
    expect(isOk(result) && result.value).toMatchObject({ style: DEFAULT_FRAME.style, colour: "#000" });
  });

  it("rejects a style it does not know", () => {
    expect(isErr(validators.frameSettings({ style: "neon" }, "$.frame"))).toBe(true);
  });

  it("gives a v3 document no frame, which is what it had", () => {
    const migrated = migrateDocument({
      schemaVersion: 3,
      source: { resourceId: "res_1", width: 10, height: 10 },
    });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.frame).toBeNull();
  });
});
