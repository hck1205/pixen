import { describe, expect, it } from "vitest";
import {
  buildSceneOps,
  commands,
  createDocument,
  createRectLayer,
  createScene,
  type EditorDocument,
} from "@pixen/core";
import { maskOps } from "../src/export/mask.js";
import type { DrawOp } from "../src/render/ops/index.js";

const WHITE = "#ffffff";
const frame = { x: 10, y: 20, width: 100, height: 60 };

function outline(): DrawOp {
  return {
    op: "path",
    commands: [{ op: "rect", rect: frame }],
    stroke: { color: "#ef3e36", width: 4, dash: [] },
  };
}

describe("maskOps", () => {
  /**
   * Someone who draws a rectangle around a face has marked the face, not four
   * thin lines. An outline that stayed an outline would mask a hollow ring.
   */
  it("fills a shape that was only outlined", () => {
    const [op] = maskOps([outline()], WHITE);
    expect(op).toMatchObject({ op: "path", fill: WHITE });
  });

  it("recolours a shape that was already filled", () => {
    const filled: DrawOp = { op: "path", commands: [{ op: "rect", rect: frame }], fill: "#2fb673" };
    expect(maskOps([filled], WHITE)[0]).toMatchObject({ fill: WHITE });
  });

  it("drops the picture, the adjustments and the decoration", () => {
    const ops: DrawOp[] = [
      { op: "clear", width: 10, height: 10 },
      { op: "fill-under", color: "#000", rect: frame },
      { op: "image", source: {} as CanvasImageSource, width: 10, height: 10 },
      { op: "adjust-pixels", adjustments: {} as never, width: 10, height: 10 },
      { op: "vignette", rect: frame, strength: 0.5 },
      { op: "filter", value: "blur(2px)" },
      { op: "alpha", value: 0.5 },
    ];
    expect(maskOps(ops, WHITE)).toEqual([]);
  });

  it("keeps the transforms, or every mark lands somewhere else", () => {
    const transform: DrawOp = { op: "transform", matrix: { a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 } };
    expect(maskOps([transform, outline()], WHITE)[0]).toBe(transform);
  });

  it("marks the area a sticker or a redaction covers, not its content", () => {
    const ops: DrawOp[] = [
      { op: "layer-image", source: {} as CanvasImageSource, frame, repeat: false },
      { op: "obscure", frame, mode: "blur", strength: 4, colour: "#000", seed: 1 },
    ];
    for (const op of maskOps(ops, WHITE)) {
      expect(op).toMatchObject({ op: "path", fill: WHITE, commands: [{ op: "rect", rect: frame }] });
    }
  });

  it("marks a text plate as well as the glyphs on it", () => {
    const text: DrawOp = {
      op: "text",
      lines: ["hello"],
      origin: { x: 0, y: 0 },
      lineHeight: 12,
      font: "10px sans-serif",
      align: "left",
      color: "#123456",
      background: { rect: frame, color: "#000000" },
    };
    const [plate, glyphs] = maskOps([text], WHITE);
    expect(plate).toMatchObject({ op: "path", fill: WHITE });
    expect(glyphs).toMatchObject({ op: "text", color: WHITE, background: undefined });
  });

  it("grows every mark by the padding, on both sides of its edge", () => {
    const [op] = maskOps([outline()], WHITE, 8);
    // A stroke straddles the path, so half of it lands outside: a stroke twice
    // the padding grows the marked area by exactly the padding.
    expect(op).toMatchObject({ stroke: { color: WHITE, width: 16 } });
  });

  it("adds no stroke at all when nothing was asked for", () => {
    const [op] = maskOps([outline()], WHITE);
    expect((op as { stroke?: unknown }).stroke).toBeUndefined();
  });
});

/**
 * A mask keeps the marks and drops the picture — and a frame is not a mark.
 *
 * It used to be an op of its own and fell into the default case for free.
 * Turning it into paths, so six treatments could be geometry rather than a
 * switch inside the canvas executor, lost that distinction: a mask of a framed
 * document came back with a rectangle nobody drew filled across the whole
 * photograph. The test that should have caught it was listing an op name that
 * had been deleted, and passing.
 */
describe("a framed document", () => {
  const source = { width: 1000, height: 500 } as unknown as OffscreenCanvas;
  const document = () => createDocument({ resourceId: "res_1", width: 1000, height: 500 });

  const maskFor = (doc: EditorDocument) =>
    maskOps(buildSceneOps(createScene(doc, { source }, { region: "crop" })), "#ffffff");

  it("marks the annotation and not the frame", () => {
    const marked = commands.addLayer(document(), createRectLayer({ x: 10, y: 10, width: 50, height: 50 }));
    const framed = commands.setFrame(marked, { style: "solid" });

    const before = maskFor(marked).filter((op) => op.op === "path");
    const after = maskFor(framed).filter((op) => op.op === "path");
    // Switching a frame on does not add a mark.
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
  });

  it("marks nothing at all when the frame is the only thing drawn", () => {
    const framed = commands.setFrame(document(), { style: "hook" });
    expect(maskFor(framed).filter((op) => op.op === "path")).toEqual([]);
  });
});
