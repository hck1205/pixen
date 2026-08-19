import { describe, expect, it } from "vitest";
import {
  createEllipseLayer,
  createImageLayer,
  createRectLayer,
  createTextLayer,
  type EditorLayer,
} from "@pixen/core";
import { layerRows } from "../src/element/chrome/inspector/layer-rows.js";

const frame = { x: 0, y: 0, width: 10, height: 10 };

function stack(): EditorLayer[] {
  return [
    createRectLayer(frame, { id: "back" }),
    createEllipseLayer(frame, { id: "middle" }),
    createTextLayer({ x: 0, y: 0 }, "Hello", { id: "front" }),
  ];
}

describe("layerRows", () => {
  it("reads top-first, the opposite of the order they are painted in", () => {
    expect(layerRows(stack()).map((row) => row.id)).toEqual(["front", "middle", "back"]);
  });

  it("has nowhere to send the ends", () => {
    const [top, , bottom] = layerRows(stack());
    expect(top?.upIndex).toBeNull();
    expect(bottom?.downIndex).toBeNull();
  });

  it("moves a layer exactly one step, in document indices", () => {
    const [top, middle, bottom] = layerRows(stack());
    // The middle layer sits at index 1 of three; up is 2, down is 0.
    expect(middle?.upIndex).toBe(2);
    expect(middle?.downIndex).toBe(1 - 1);
    expect(top?.downIndex).toBe(1);
    expect(bottom?.upIndex).toBe(1);
  });

  it("marks the selected row and no other", () => {
    const rows = layerRows(stack(), "middle");
    expect(rows.filter((row) => row.selected).map((row) => row.id)).toEqual(["middle"]);
  });

  it("carries the visibility and lock the layer actually has", () => {
    const layers = [createRectLayer(frame, { id: "a", visible: false, locked: true })];
    const [row] = layerRows(layers);
    expect(row?.visible).toBe(false);
    expect(row?.locked).toBe(true);
  });

  it("calls a text layer by its own words", () => {
    const [row] = layerRows([createTextLayer({ x: 0, y: 0 }, "  Sign   here  ")]);
    expect(row?.title).toBe("Sign here");
  });

  it("prefers a name the host gave it", () => {
    const [row] = layerRows([createTextLayer({ x: 0, y: 0 }, "typed", { name: "Signature" })]);
    expect(row?.title).toBe("Signature");
  });

  it("cuts a long title rather than letting it push the buttons off the row", () => {
    const [row] = layerRows([createTextLayer({ x: 0, y: 0 }, "x".repeat(80))]);
    expect(row?.title).toHaveLength(24);
    expect(row?.title?.endsWith("…")).toBe(true);
  });

  it("falls back to the kind of layer when there is nothing to quote", () => {
    const rows = layerRows([
      createRectLayer(frame),
      createImageLayer("resource", frame),
      createTextLayer({ x: 0, y: 0 }, "   "),
    ]);
    expect(rows.map((row) => row.title)).toEqual([null, null, null]);
    expect(rows.map((row) => row.labelKey)).toEqual(["text", "sticker", "rectangle"]);
  });

  it("has no rows for an image nobody has drawn on", () => {
    expect(layerRows([])).toEqual([]);
  });
});
