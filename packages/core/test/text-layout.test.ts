/** How much room a caption takes: where its lines break, and how tall the block is. */
import { describe, expect, it } from "vitest";
import { createTextLayer, estimateTextWidth, LINE_HEIGHT_RATIO, textLayerOps, wrapLines, type DrawOp } from "@pixen/core";

/** Ten pixels a character, so a wrap point is arithmetic rather than a font. */
const measure = (text: string) => text.length * 10;

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
