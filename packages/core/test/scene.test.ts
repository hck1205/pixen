import { describe, expect, it } from "vitest";
import {
  applyToPoint,
  createDocument,
  createImageLayer,
  createRectLayer,
  createScene,
  validateDocument,
  SCHEMA_VERSION,
  migrateDocument,
  type EditorDocument,
  commands,} from "@pixen/core";

const source = { width: 1000, height: 500 } as unknown as CanvasImageSource;

function document() {
  return createDocument({ resourceId: "res_1", width: 1000, height: 500 });
}

describe("createScene", () => {
  it("maps the crop onto the export target", () => {
    const doc = commands.setCrop(document(), { x: 200, y: 100, width: 400, height: 200 });
    const scene = createScene(doc, { source }, { region: "crop" });

    expect(scene.target).toEqual({ width: 400, height: 200 });
    const topLeft = applyToPoint(scene.image.matrix, { x: 200, y: 100 });
    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(0);
  });

  it("says where the picture goes, whatever bitmap is standing in for it", () => {
    // The scene names the picture's own size and the executor stretches
    // whatever it is given into that box. A proxy needs no arithmetic here, and
    // the size is not the proxy's — a redaction's strength is a fraction of it.
    const scene = createScene(document(), { source }, { region: "stage" });
    expect(scene.image.size).toEqual({ width: 1000, height: 500 });

    const corner = applyToPoint(scene.image.matrix, { x: 1000, y: 500 });
    expect(corner.x).toBeCloseTo(1000);
    expect(corner.y).toBeCloseTo(500);
  });

  it("renders the whole stage in stage region, including outside the crop", () => {
    const doc = commands.setCrop(document(), { x: 400, y: 200, width: 100, height: 100 });
    const scene = createScene(doc, { source }, { region: "stage" });
    expect(scene.sourceRect).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });

  it("scales output when the document asks for a resize", () => {
    const doc = commands.setOutput(document(), { width: 500, height: 250 });
    const scene = createScene(doc, { source });
    expect(scene.target).toEqual({ width: 500, height: 250 });
    expect(scene.scale).toBeCloseTo(0.5);
  });

  it("skips hidden layers", () => {
    let doc = commands.addLayer(document(), createRectLayer({ x: 0, y: 0, width: 10, height: 10 }));
    doc = commands.addLayer(doc, createRectLayer({ x: 0, y: 0, width: 10, height: 10 }, { visible: false }));
    expect(createScene(doc, { source }).layers).toHaveLength(1);
  });

  it("resolves the bitmap an image layer refers to", () => {
    const bitmap = { width: 64, height: 64 } as unknown as CanvasImageSource;
    const layer = createImageLayer("res_mark", { x: 0, y: 0, width: 100, height: 100 });
    const doc = commands.addLayer(document(), layer);

    const resolved = createScene(doc, { source, resolveResource: () => bitmap });
    expect(resolved.layers[0]!.resource).toBe(bitmap);
  });

  it("leaves an image layer without pixels when its resource is gone", () => {
    const layer = createImageLayer("res_missing", { x: 0, y: 0, width: 100, height: 100 });
    const doc = commands.addLayer(document(), layer);

    // A document can outlive the sticker it referenced; the renderer draws
    // nothing rather than failing mid-frame.
    expect(createScene(doc, { source, resolveResource: () => null }).layers[0]!.resource).toBeUndefined();
    expect(createScene(doc, { source }).layers[0]!.resource).toBeUndefined();
  });

  it("passes layer coordinates through the same matrix as the image", () => {
    const layer = createRectLayer({ x: 100, y: 100, width: 50, height: 50 });
    const doc = commands.addLayer(commands.rotateQuarterTurns(document(), 1), layer);
    const scene = createScene(doc, { source });
    const node = scene.layers[0]!;
    expect(node.matrix).toEqual(scene.image.matrix);
  });
});

/**
 * A layer belongs either to the picture or to the frame around it.
 *
 * An `image` layer rides the rotation and the flips, so a caption written
 * across someone's face stays across their face when the photograph is turned.
 * An `output` layer does not: it is measured in the exported image's own pixels
 * from its own top-left, which is what a watermark, a caption bar or a logo in
 * a corner actually wants.
 */
describe("which frame of reference a layer is in", () => {
  const source = { resourceId: "res_1", width: 400, height: 200 };
  const bitmap = { width: 400, height: 200 } as unknown as CanvasImageSource;

  const withLayer = (space: "image" | "output", document = createDocument(source)) => ({
    ...document,
    layers: [createRectLayer({ x: 0, y: 0, width: 10, height: 10 }, { id: "probe", space })],
  });

  const layerMatrix = (document: EditorDocument) =>
    createScene(document, { source: bitmap }, { region: "crop" }).layers[0]!.matrix;

  it("turns an image-space layer with the picture", () => {
    const upright = layerMatrix(withLayer("image"));
    const turned = layerMatrix({
      ...withLayer("image"),
      transform: { rotation: Math.PI / 2, flipX: false, flipY: false },
    });
    expect(turned).not.toEqual(upright);
  });

  it("leaves an output-space layer exactly where it was when the picture turns", () => {
    // The whole point: the frame does not turn with what is inside it.
    const upright = layerMatrix(withLayer("output"));
    const turned = layerMatrix({
      ...withLayer("output"),
      transform: { rotation: Math.PI / 2, flipX: false, flipY: false },
    });
    expect(turned).toEqual(upright);
  });

  it("leaves it where it was when the picture is flipped, too", () => {
    const flipped = layerMatrix({
      ...withLayer("output"),
      transform: { rotation: 0, flipX: true, flipY: false },
    });
    expect(flipped).toEqual(layerMatrix(withLayer("output")));
  });

  it("puts an output-space layer's origin at the exported image's own corner", () => {
    // A crop taken out of the middle: an output layer at (0,0) is the top-left
    // of the *file*, not of the picture it was cut from.
    const cropped = { ...withLayer("output"), crop: { x: 120, y: 40, width: 200, height: 100 } };
    const scene = createScene(cropped, { source: bitmap }, { region: "crop" });
    expect(applyToPoint(scene.layers[0]!.matrix, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("moves an image-space layer's origin when the crop moves, and an output one not at all", () => {
    const moved = (space: "image" | "output") => {
      const document = { ...withLayer(space), crop: { x: 120, y: 40, width: 200, height: 100 } };
      const scene = createScene(document, { source: bitmap }, { region: "crop" });
      return applyToPoint(scene.layers[0]!.matrix, { x: 0, y: 0 });
    };
    expect(moved("image")).not.toEqual({ x: 0, y: 0 });
    expect(moved("output")).toEqual({ x: 0, y: 0 });
  });

  it("lands an output-space layer's far corner on the file's far corner", () => {
    // Both at once — a crop taken from the middle *and* an output size that is
    // not the crop's — because either alone hides an offset applied in the
    // wrong order.
    const document = withLayer("output");
    const scene = createScene(
      {
        ...document,
        crop: { x: 120, y: 40, width: 200, height: 100 },
        output: { ...document.output, width: 50, height: 25 },
      },
      { source: bitmap },
      { region: "crop" },
    );
    const corner = applyToPoint(scene.layers[0]!.matrix, { x: 50, y: 25 });
    expect(corner.x).toBeCloseTo(50, 6);
    expect(corner.y).toBeCloseTo(25, 6);
    expect(applyToPoint(scene.layers[0]!.matrix, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("measures an output-space layer in the file's pixels, not the picture's", () => {
    // Exported at half size: a stroke measured in the picture halves with it,
    // and a stroke measured in the file does not. A 4px rule around the frame
    // is 4px in the file however large the file is, which is the point.
    const exportedSmall = (space: "image" | "output") => {
      const document = withLayer(space);
      return createScene(
        { ...document, output: { ...document.output, width: 200, height: 100 } },
        { source: bitmap },
        { region: "crop" },
      ).layers[0]!.scale;
    };
    expect(exportedSmall("image")).toBeCloseTo(0.5, 6);
    expect(exportedSmall("output")).toBeCloseTo(1, 6);
  });
});

/**
 * Every layer a v10 document holds is in the picture's own pixels — that was
 * the only kind there was — so a migration that fills `image` in leaves it
 * looking exactly as it did.
 */
describe("a document written before layers had a frame of reference", () => {
  const stored = (document: EditorDocument) => JSON.parse(JSON.stringify(document)) as Record<string, unknown>;

  it("reads its layers as the picture's own", () => {
    const document = createDocument({ resourceId: "res_1", width: 20, height: 10 });
    const withLayer = { ...document, layers: [createRectLayer({ x: 1, y: 1, width: 4, height: 4 })] };
    const old = stored(withLayer);
    old.schemaVersion = 10;
    (old.layers as Record<string, unknown>[])[0]!.space = undefined;
    delete (old.layers as Record<string, unknown>[])[0]!.space;

    const migrated = migrateDocument(old);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect((migrated.layers as Record<string, unknown>[])[0]!.space).toBe("image");
    expect(validateDocument(migrated).ok).toBe(true);
  });

  it("leaves a layer that already names its space alone", () => {
    const document = createDocument({ resourceId: "res_1", width: 20, height: 10 });
    const withLayer = {
      ...document,
      layers: [createRectLayer({ x: 1, y: 1, width: 4, height: 4 }, { space: "output" })],
    };
    const old = stored(withLayer);
    old.schemaVersion = 10;
    expect((migrateDocument(old).layers as Record<string, unknown>[])[0]!.space).toBe("output");
  });

  it("refuses a stored space it does not know", () => {
    const document = createDocument({ resourceId: "res_1", width: 20, height: 10 });
    const withLayer = { ...document, layers: [createRectLayer({ x: 1, y: 1, width: 4, height: 4 })] };
    const broken = stored(withLayer);
    (broken.layers as Record<string, unknown>[])[0]!.space = "somewhere-else";
    expect(validateDocument(broken).ok).toBe(false);
  });
});
