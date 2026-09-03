/** What is under the pointer — a crop handle, a layer, a layer's handle — and the cursor that says so. */
import { describe, expect, it } from "vitest";
import { createEllipseLayer, createRectLayer, layerHandlePosition, ROTATION_SNAP, type EditorLayer } from "@pixen/core";
import { beginGesture, cancelGesture, cropHandlePosition, cursorFor, cursorForHandle, endGesture, hitCropHandle, hitLayer, hitLayerHandle, isInsideCrop, moveGesture, type GestureContext, type GestureState } from "../../src/viewport/gestures/index.js";
import { context, intents, kinds, at } from "./fixture.js";

describe("crop hit testing", () => {
  const ctx = context();

  it("locates every handle anchor", () => {
    expect(cropHandlePosition(ctx.crop, "top-left")).toEqual({ x: 100, y: 100 });
    expect(cropHandlePosition(ctx.crop, "bottom-right")).toEqual({ x: 500, y: 300 });
    expect(cropHandlePosition(ctx.crop, "top")).toEqual({ x: 300, y: 100 });
    expect(cropHandlePosition(ctx.crop, "left")).toEqual({ x: 100, y: 200 });
  });

  it("grabs a handle within the hit radius", () => {
    expect(hitCropHandle(ctx, { x: 104, y: 104 })).toBe("top-left");
  });

  it("ignores a point beyond the radius", () => {
    expect(hitCropHandle(ctx, { x: 250, y: 200 })).toBeNull();
  });

  it("prefers the nearest of two candidates", () => {
    const narrow = context({ crop: { x: 100, y: 100, width: 20, height: 200 } });
    expect(hitCropHandle(narrow, { x: 102, y: 100 })).toBe("top-left");
    expect(hitCropHandle(narrow, { x: 118, y: 100 })).toBe("top-right");
  });

  it("knows inside from outside", () => {
    expect(isInsideCrop(ctx.crop, { x: 300, y: 200 })).toBe(true);
    expect(isInsideCrop(ctx.crop, { x: 50, y: 200 })).toBe(false);
  });
});

describe("layer hit testing", () => {
  const back = createRectLayer({ x: 0, y: 0, width: 200, height: 200 }, { id: "back" });
  const front = createEllipseLayer({ x: 50, y: 50, width: 100, height: 100 }, { id: "front" });
  const ctx = context({ layers: [back, front] });

  it("returns the topmost layer under the point", () => {
    expect(hitLayer(ctx, { x: 100, y: 100 })?.id).toBe("front");
  });

  it("falls through to a lower layer outside the top one", () => {
    expect(hitLayer(ctx, { x: 20, y: 20 })?.id).toBe("back");
  });

  it("returns nothing on empty space", () => {
    expect(hitLayer(ctx, { x: 900, y: 400 })).toBeNull();
  });

  it("skips hidden and locked layers", () => {
    const hidden = { ...front, visible: false } as EditorLayer;
    const locked = { ...back, locked: true } as EditorLayer;
    expect(hitLayer(context({ layers: [locked, hidden] }), { x: 100, y: 100 })).toBeNull();
  });

  it("allows a tolerance around thin shapes", () => {
    const line = createRectLayer({ x: 400, y: 400, width: 0, height: 0 }, { id: "dot" });
    expect(hitLayer(context({ layers: [line] }), { x: 405, y: 405 })?.id).toBe("dot");
  });
});

describe("cursors", () => {
  it("follows the crop handle direction", () => {
    expect(cursorForHandle("top")).toBe("ns-resize");
    expect(cursorForHandle("left")).toBe("ew-resize");
    expect(cursorForHandle("top-left")).toBe("nwse-resize");
    expect(cursorForHandle("top-right")).toBe("nesw-resize");
  });

  it("offers a grab hand over the crop and a resize over its handles", () => {
    expect(cursorFor(context(), { x: 100, y: 100 })).toBe("nwse-resize");
    expect(cursorFor(context(), { x: 300, y: 200 })).toBe("grab");
  });

  it("shows a move cursor over a selectable layer", () => {
    const ctx = context({
      tool: "select",
      layers: [createRectLayer({ x: 0, y: 0, width: 100, height: 100 }, { id: "a" })],
    });
    expect(cursorFor(ctx, { x: 50, y: 50 })).toBe("move");
    expect(cursorFor(ctx, { x: 900, y: 400 })).toBe("default");
  });

  it("shows a crosshair for the drawing tools", () => {
    expect(cursorFor(context({ tool: "arrow" }), { x: 10, y: 10 })).toBe("crosshair");
  });
});

describe("layer handles", () => {
  const layer = createRectLayer({ x: 100, y: 100, width: 200, height: 100 }, { id: "rect_1" });
  const selected = (overrides: Partial<GestureContext> = {}) =>
    context({ tool: "select", layers: [layer], selectedId: layer.id, ...overrides });

  it("offers no handles without a selection", () => {
    expect(hitLayerHandle(context({ tool: "select", layers: [layer] }), { x: 100, y: 100 })).toBeNull();
  });

  it("offers none on a locked layer, which is what locked means", () => {
    const locked = { ...layer, locked: true };
    const ctx = context({ tool: "select", layers: [locked], selectedId: locked.id });
    expect(hitLayerHandle(ctx, { x: 100, y: 100 })).toBeNull();
  });

  it("finds the handle under the pointer", () => {
    expect(hitLayerHandle(selected(), { x: 100, y: 100 })).toBe("top-left");
    expect(hitLayerHandle(selected(), { x: 300, y: 200 })).toBe("bottom-right");
    expect(hitLayerHandle(selected(), layerHandlePosition(layer, "rotate"))).toBe("rotate");
    expect(hitLayerHandle(selected(), { x: 200, y: 150 })).toBeNull();
  });

  it("names the cursor for a grip and for the body", () => {
    expect(cursorFor(selected(), { x: 100, y: 100 })).toBe("nwse-resize");
    expect(cursorFor(selected(), layerHandlePosition(layer, "rotate"))).toBe("grab");
    expect(cursorFor(selected(), { x: 200, y: 150 })).toBe("move");
  });

  it("grabs a handle rather than panning, even with shift held", () => {
    // Shift pans everywhere else, but here it means "lock the ratio", and the
    // drag it modifies is the one that just started.
    const outcome = beginGesture({ point: { x: 300, y: 200 }, shiftKey: true }, selected());
    expect(outcome.state).toEqual({ kind: "layer-transform", id: layer.id, handle: "bottom-right" });
    expect(kinds(outcome.effects)).toEqual(["intent:begin-transaction"]);
  });

  it("moves the layer when the body is grabbed instead", () => {
    expect(beginGesture(at(200, 150), selected()).state).toMatchObject({ kind: "layer-move" });
  });

  it("drags a handle as one resize intent", () => {
    const state: GestureState = { kind: "layer-transform", id: layer.id, handle: "bottom-right" };
    const outcome = moveGesture(state, at(400, 400), selected());
    expect(intents(outcome.effects)).toEqual([
      {
        kind: "drag-layer-handle",
        id: layer.id,
        handle: "bottom-right",
        pointer: { x: 400, y: 400 },
        minSize: 10,
      },
    ]);
  });

  it("locks the layer's own ratio while shift is held", () => {
    const state: GestureState = { kind: "layer-transform", id: layer.id, handle: "bottom-right" };
    const outcome = moveGesture(state, { point: { x: 400, y: 400 }, shiftKey: true }, selected());
    expect(intents(outcome.effects)[0]).toMatchObject({ aspectRatio: 2 });
  });

  it("snaps a rotation while shift is held, and not otherwise", () => {
    const state: GestureState = { kind: "layer-transform", id: layer.id, handle: "rotate" };
    expect(intents(moveGesture(state, at(400, 0), selected()).effects)[0]).not.toHaveProperty("snap");
    const snapped = moveGesture(state, { point: { x: 400, y: 0 }, shiftKey: true }, selected());
    expect(intents(snapped.effects)[0]).toMatchObject({ snap: ROTATION_SNAP });
  });

  it("commits the transform as a single undo step", () => {
    const state: GestureState = { kind: "layer-transform", id: layer.id, handle: "top" };
    expect(kinds(endGesture(state, selected()).effects)).toEqual(["intent:commit-transaction"]);
    expect(kinds(cancelGesture(state).effects)).toEqual(["intent:rollback-transaction"]);
  });
});
