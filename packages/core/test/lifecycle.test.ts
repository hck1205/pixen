import { describe, expect, it } from "vitest";
import { replaceSource } from "../src/engine/commands.js";
import { createDocument } from "../src/model/document.js";
import { createStickerLayer } from "../src/export/placement.js";
import { center } from "../src/geometry/rect.js";
import { layerBounds } from "../src/model/layers.js";
import { createRectLayer, createTextLayer } from "../src/model/layers.js";
import { PixenError } from "../src/errors/index.js";
import { chainAbort } from "../src/util/abort.js";

const source = { resourceId: "res_1", width: 1600, height: 1200 };

function documentWithEdits() {
  const base = createDocument(source);
  return {
    ...base,
    crop: { x: 100, y: 200, width: 800, height: 600 },
    layers: [
      createRectLayer({ x: 400, y: 300, width: 200, height: 100 }, { id: "box" }),
      createTextLayer({ x: 800, y: 600 }, "caption", { id: "caption", fontSize: 60 }),
    ],
  };
}

describe("replaceSource", () => {
  it("swaps the pixels and leaves the edit alone at the same size", () => {
    const before = documentWithEdits();
    const after = replaceSource(before, { ...source, resourceId: "res_2" });

    expect(after.source.resourceId).toBe("res_2");
    expect(after.crop).toEqual(before.crop);
    expect(after.layers).toEqual(before.layers);
  });

  it("keeps the picture's own name and type", () => {
    const after = replaceSource(documentWithEdits(), {
      ...source,
      resourceId: "res_2",
      name: "cut-out.png",
      mimeType: "image/png",
    });
    expect(after.source.name).toBe("cut-out.png");
    expect(after.source.mimeType).toBe("image/png");
  });

  it("rescales the edit when the replacement is the same shape at another size", () => {
    // An upscaler hands back the same picture at twice the resolution; the crop
    // and the marks have to land on the same content, not the same pixels.
    const before = documentWithEdits();
    const after = replaceSource(before, { resourceId: "res_2", width: 3200, height: 2400 });

    expect(after.crop).toEqual({ x: 200, y: 400, width: 1600, height: 1200 });
    const [box] = after.layers;
    expect(box?.type === "rect" && box.frame).toEqual({ x: 800, y: 600, width: 400, height: 200 });
  });

  it("scales type with the picture, so a caption stays the same size on screen", () => {
    const after = replaceSource(documentWithEdits(), { resourceId: "res_2", width: 3200, height: 2400 });
    const caption = after.layers.find((layer) => layer.id === "caption");
    expect(caption?.type === "text" && caption.fontSize).toBe(120);
  });

  it("tolerates the rounding an integer pixel size forces", () => {
    // Half of 1601 is 800 or 801, never 800.5 — an exact test would refuse a
    // replacement that is right.
    expect(() => replaceSource(documentWithEdits(), { resourceId: "res_2", width: 801, height: 600 })).not.toThrow();
  });

  it("refuses a replacement of a different shape rather than mangling the edit", () => {
    expect(() => replaceSource(documentWithEdits(), { resourceId: "res_2", width: 1600, height: 900 })).toThrow(
      PixenError,
    );
  });

  it("leaves a document with no crop without one", () => {
    const base = createDocument(source);
    expect(replaceSource(base, { resourceId: "res_2", width: 800, height: 600 }).crop).toBeNull();
  });
});

describe("chainAbort", () => {
  it("aborts when the caller's signal does", () => {
    const caller = new AbortController();
    const chained = chainAbort(caller.signal);
    expect(chained.signal.aborted).toBe(false);
    caller.abort();
    expect(chained.signal.aborted).toBe(true);
  });

  it("is already aborted when the caller's signal already was", () => {
    const caller = new AbortController();
    caller.abort();
    expect(chainAbort(caller.signal).signal.aborted).toBe(true);
  });

  it("still aborts on its own, so the editor can call off work nobody else owns", () => {
    const chained = chainAbort();
    chained.abort();
    expect(chained.signal.aborted).toBe(true);
  });

  it("does not abort the caller's signal when it aborts", () => {
    const caller = new AbortController();
    const chained = chainAbort(caller.signal);
    chained.abort();
    expect(caller.signal.aborted).toBe(false);
  });
});

describe("createStickerLayer", () => {
  const image = { resourceId: "res_1", width: 1600, height: 1200 };

  it("centres the sticker in what is currently cropped", () => {
    const document = { ...createDocument(image), crop: { x: 200, y: 100, width: 400, height: 300 } };
    const layer = createStickerLayer(document, { resourceId: "mark", size: { width: 100, height: 100 } });

    expect(center(layerBounds(layer))).toEqual(center(document.crop));
  });

  it("keeps the bitmap's own aspect ratio", () => {
    const layer = createStickerLayer(createDocument(image), {
      resourceId: "mark",
      size: { width: 200, height: 50 },
    });
    const bounds = layerBounds(layer);
    expect(bounds.width / bounds.height).toBeCloseTo(4, 5);
  });

  it("scales against the longest edge of the region, not the picture", () => {
    const cropped = { ...createDocument(image), crop: { x: 0, y: 0, width: 400, height: 400 } };
    const layer = createStickerLayer(cropped, {
      resourceId: "mark",
      size: { width: 100, height: 100 },
      scale: 0.5,
    });
    expect(layerBounds(layer).width).toBeCloseTo(200, 5);
  });

  /**
   * The crop is a stage rectangle; a layer lives in image coordinates. Without
   * the conversion back, a sticker added to a quarter-turned picture lands
   * beside the frame rather than inside it.
   */
  it("comes back through stage-to-image, so a rotated picture still gets it inside", () => {
    const base = createDocument(image);
    const rotated = {
      ...base,
      transform: { ...base.transform, rotation: Math.PI / 2 },
      crop: { x: 0, y: 0, width: 1200, height: 1600 },
    };
    const bounds = layerBounds(createStickerLayer(rotated, { resourceId: "mark", size: { width: 100, height: 100 } }));

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(image.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(image.height);
  });

  it("names an unnamed sticker, so the layer list has something to show", () => {
    const layer = createStickerLayer(createDocument(image), {
      resourceId: "mark",
      size: { width: 10, height: 10 },
    });
    expect(layer.name).toBe("sticker");
  });
});
