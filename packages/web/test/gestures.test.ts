import { describe, expect, it } from "vitest";
import {
  createEllipseLayer,
  createPathLayer,
  createRectLayer,
  IDENTITY,
  scaling,
  translation,
  compose,
  type EditorLayer,
  type Intent,
} from "@pixen/core";
import {
  beginGesture,
  cancelGesture,
  constrainToAxis,
  cropHandlePosition,
  cursorFor,
  cursorForHandle,
  endGesture,
  frameFrom,
  hitCropHandle,
  hitLayer,
  IDLE,
  isDegenerate,
  isInsideCrop,
  moveGesture,
  pinchFrom,
  pinchStep,
  screenToImage,
  screenToStage,
  wheelZoomFactor,
  type GestureContext,
  type GestureEffect,
  type GestureState,
} from "../src/viewport/gestures/index.js";
import { DEFAULT_STYLE } from "../src/tools/index.js";

/**
 * Identity matrices make screen, stage and image coordinates the same, so these
 * tests read as statements about behaviour rather than about arithmetic. The
 * conversion itself is exercised separately with a scaled view.
 */
function context(overrides: Partial<GestureContext> = {}): GestureContext {
  let counter = 0;
  return {
    tool: "crop",
    crop: { x: 100, y: 100, width: 400, height: 200 },
    stage: { x: 0, y: 0, width: 1000, height: 500 },
    layers: [],
    viewMatrix: IDENTITY,
    stageFromImage: IDENTITY,
    imageLongestEdge: 1000,
    style: DEFAULT_STYLE,
    minCropSize: 24,
    createId: (prefix) => `${prefix}_${++counter}`,
    ...overrides,
  };
}

function intents(effects: readonly GestureEffect[]): Intent[] {
  return effects.flatMap((effect) => (effect.kind === "intent" ? [effect.intent] : []));
}

function kinds(effects: readonly GestureEffect[]): string[] {
  return effects.map((effect) => (effect.kind === "intent" ? `intent:${effect.intent.kind}` : effect.kind));
}

const at = (x: number, y: number) => ({ point: { x, y } });

describe("coordinate conversion", () => {
  it("is the identity when the view is untransformed", () => {
    expect(screenToStage(context(), { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it("undoes zoom and pan", () => {
    const view = compose(translation(50, 20), scaling(2));
    const ctx = context({ viewMatrix: view });
    expect(screenToStage(ctx, { x: 250, y: 120 })).toEqual({ x: 100, y: 50 });
  });

  it("undoes the document transform on the way to image space", () => {
    // Stage is the image scaled by two, so a stage point halves in image space.
    const ctx = context({ stageFromImage: scaling(2) });
    expect(screenToImage(ctx, { x: 100, y: 50 })).toEqual({ x: 50, y: 25 });
  });
});

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

describe("beginGesture", () => {
  it("pans the view on the middle button, whatever the tool", () => {
    const outcome = beginGesture({ point: { x: 10, y: 10 }, button: 1 }, context({ tool: "rect" }));
    expect(outcome.state.kind).toBe("view-pan");
    expect(outcome.effects).toEqual([]);
  });

  it("pans the view while shift is held", () => {
    const outcome = beginGesture({ point: { x: 10, y: 10 }, shiftKey: true }, context({ tool: "crop" }));
    expect(outcome.state.kind).toBe("view-pan");
  });

  it("grabs a crop handle and opens a transaction", () => {
    const outcome = beginGesture(at(100, 100), context());
    expect(outcome.state).toEqual({ kind: "crop-resize", handle: "top-left" });
    expect(intents(outcome.effects)).toEqual([{ kind: "begin-transaction", label: "Crop" }]);
  });

  it("moves the crop from inside it", () => {
    const outcome = beginGesture(at(300, 200), context());
    expect(outcome.state.kind).toBe("crop-move");
    expect(intents(outcome.effects)).toEqual([{ kind: "begin-transaction", label: "Move crop" }]);
  });

  it("pans the view from outside the crop, without touching the document", () => {
    const outcome = beginGesture(at(20, 20), context());
    expect(outcome.state.kind).toBe("view-pan");
    expect(outcome.effects).toEqual([]);
  });

  it("selects and starts moving a layer", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 100, height: 100 }, { id: "a" });
    const outcome = beginGesture(at(50, 50), context({ tool: "select", layers: [layer] }));
    expect(outcome.state).toMatchObject({ kind: "layer-move", id: "a" });
    expect(intents(outcome.effects)).toEqual([
      { kind: "select", id: "a" },
      { kind: "begin-transaction", label: "Move annotation" },
    ]);
  });

  it("clears the selection when clicking empty space", () => {
    const outcome = beginGesture(at(900, 400), context({ tool: "select" }));
    expect(outcome.state.kind).toBe("view-pan");
    expect(intents(outcome.effects)).toEqual([{ kind: "select", id: null }]);
  });

  it("creates a text layer and hands over to the select tool", () => {
    const outcome = beginGesture(at(120, 140), context({ tool: "text" }));
    expect(outcome.state).toBe(IDLE);
    expect(kinds(outcome.effects)).toEqual(["intent:add-layer", "select-tool", "focus-text"]);

    const [added] = intents(outcome.effects);
    expect(added).toMatchObject({ kind: "add-layer", layer: { type: "text", position: { x: 120, y: 140 } } });
  });

  it("starts a shape with a transaction and a zero-sized layer", () => {
    const outcome = beginGesture(at(10, 20), context({ tool: "rect" }));
    expect(outcome.state).toMatchObject({ kind: "draw-shape", tool: "rect", origin: { x: 10, y: 20 } });
    expect(kinds(outcome.effects)).toEqual(["intent:begin-transaction", "intent:add-layer"]);
  });

  it("draws a redaction, in the mode the style remembers", () => {
    const outcome = beginGesture(
      at(0, 0),
      context({ tool: "redact", style: { ...DEFAULT_STYLE, redactionMode: "pixelate" } }),
    );
    const [, added] = intents(outcome.effects);
    expect(added).toMatchObject({
      kind: "add-layer",
      layer: { type: "redact", mode: "pixelate", strength: DEFAULT_STYLE.redactionStrength },
    });
  });

  it("starts a free-draw path at the pointer", () => {
    const outcome = beginGesture(at(5, 6), context({ tool: "draw" }));
    expect(outcome.state).toMatchObject({ kind: "draw-path", points: [{ x: 5, y: 6 }] });
  });

  it("does nothing for a tool it does not know", () => {
    const outcome = beginGesture(at(0, 0), context({ tool: "nonsense" as never }));
    expect(outcome.state).toBe(IDLE);
    expect(outcome.effects).toEqual([]);
  });

  it("mints ids through the injected factory", () => {
    const outcome = beginGesture(at(0, 0), context({ tool: "ellipse" }));
    expect((intents(outcome.effects)[1] as { layer: { id: string } }).layer.id).toBe("ellipse_1");
  });
});

describe("moveGesture", () => {
  it("reports a pan delta in screen pixels", () => {
    const state: GestureState = { kind: "view-pan", last: { x: 10, y: 10 } };
    const outcome = moveGesture(state, at(30, 25), context());
    expect(outcome.effects).toEqual([{ kind: "view-pan", delta: { x: 20, y: 15 } }]);
    expect(outcome.state).toMatchObject({ last: { x: 30, y: 25 } });
  });

  it("converts a crop drag into stage space", () => {
    const ctx = context({ viewMatrix: scaling(2) });
    const state: GestureState = { kind: "crop-move", last: { x: 100, y: 100 } };
    const outcome = moveGesture(state, at(140, 100), ctx);
    // Forty screen pixels at 2x zoom is twenty stage units.
    expect(intents(outcome.effects)).toEqual([{ kind: "pan-crop", delta: { x: 20, y: 0 } }]);
  });

  it("passes the minimum crop size along with a handle drag", () => {
    const state: GestureState = { kind: "crop-resize", handle: "bottom-right" };
    const outcome = moveGesture(state, at(400, 250), context({ minCropSize: 32 }));
    expect(intents(outcome.effects)).toEqual([
      { kind: "drag-crop-handle", handle: "bottom-right", pointer: { x: 400, y: 250 }, minSize: 32 },
    ]);
  });

  it("moves a layer in image space", () => {
    const state: GestureState = { kind: "layer-move", id: "a", last: { x: 0, y: 0 } };
    const outcome = moveGesture(state, at(15, -5), context());
    expect(intents(outcome.effects)).toEqual([{ kind: "move-layer", id: "a", delta: { x: 15, y: -5 } }]);
  });

  it("normalises a rectangle dragged up and to the left", () => {
    const state: GestureState = { kind: "draw-shape", id: "a", origin: { x: 100, y: 100 }, tool: "rect" };
    const outcome = moveGesture(state, at(40, 60), context());
    expect(intents(outcome.effects)).toEqual([
      { kind: "update-layer", id: "a", patch: { frame: { x: 40, y: 60, width: 60, height: 40 } } },
    ]);
  });

  it("squares a shape while shift is held", () => {
    const state: GestureState = { kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "ellipse" };
    const outcome = moveGesture(state, { point: { x: 100, y: 40 }, shiftKey: true }, context());
    expect(intents(outcome.effects)[0]).toMatchObject({ patch: { frame: { width: 100, height: 100 } } });
  });

  it("moves an arrow's tip rather than its frame", () => {
    const state: GestureState = { kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "arrow" };
    const outcome = moveGesture(state, at(80, 30), context());
    expect(intents(outcome.effects)).toEqual([
      { kind: "update-layer", id: "a", patch: { to: { x: 80, y: 30 } } },
    ]);
  });

  it("snaps a shift-held arrow to the dominant axis", () => {
    const state: GestureState = { kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "arrow" };
    const outcome = moveGesture(state, { point: { x: 80, y: 30 }, shiftKey: true }, context());
    expect(intents(outcome.effects)[0]).toMatchObject({ patch: { to: { x: 80, y: 0 } } });
  });

  it("appends a free-draw sample that moved far enough", () => {
    const state: GestureState = { kind: "draw-path", id: "a", points: [{ x: 0, y: 0 }] };
    const outcome = moveGesture(state, at(50, 0), context());
    expect(intents(outcome.effects)).toEqual([
      { kind: "update-layer", id: "a", patch: { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] } },
    ]);
  });

  it("drops a free-draw sample the smoothing would not notice", () => {
    const state: GestureState = { kind: "draw-path", id: "a", points: [{ x: 0, y: 0 }] };
    const outcome = moveGesture(state, at(1, 0), context());
    expect(outcome.effects).toEqual([]);
    expect(outcome.state).toBe(state);
  });

  it("ignores a move with no gesture in progress", () => {
    expect(moveGesture(IDLE, at(1, 1), context()).effects).toEqual([]);
  });
});

describe("endGesture", () => {
  const drawn = (layer: EditorLayer) => context({ layers: [layer] });

  it("commits a crop drag", () => {
    const outcome = endGesture({ kind: "crop-resize", handle: "top" }, context());
    expect(intents(outcome.effects)).toEqual([{ kind: "commit-transaction" }]);
    expect(outcome.state).toBe(IDLE);
  });

  it("commits a shape that is big enough to keep", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 200, height: 100 }, { id: "a" });
    const outcome = endGesture({ kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "rect" }, drawn(layer));
    expect(intents(outcome.effects)).toEqual([{ kind: "commit-transaction" }]);
  });

  it("rolls back the zero-sized layer a stray tap leaves behind", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 0, height: 0 }, { id: "a" });
    const outcome = endGesture({ kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "rect" }, drawn(layer));
    expect(intents(outcome.effects)).toEqual([{ kind: "rollback-transaction" }]);
  });

  it("rolls back a path with a single sample", () => {
    const layer = createPathLayer([{ x: 0, y: 0 }], { id: "a" });
    const outcome = endGesture({ kind: "draw-path", id: "a", points: [{ x: 0, y: 0 }] }, drawn(layer));
    expect(intents(outcome.effects)).toEqual([{ kind: "rollback-transaction" }]);
  });

  it("rolls back when the layer vanished mid-gesture", () => {
    const outcome = endGesture({ kind: "draw-shape", id: "gone", origin: { x: 0, y: 0 }, tool: "rect" }, context());
    expect(intents(outcome.effects)).toEqual([{ kind: "rollback-transaction" }]);
  });

  it("has nothing to commit after a view pan", () => {
    expect(endGesture({ kind: "view-pan", last: { x: 0, y: 0 } }, context()).effects).toEqual([]);
  });
});

describe("cancelGesture", () => {
  it("rolls back an edit in progress", () => {
    const outcome = cancelGesture({ kind: "crop-move", last: { x: 0, y: 0 } });
    expect(intents(outcome.effects)).toEqual([{ kind: "rollback-transaction" }]);
  });

  it("leaves a view pan alone", () => {
    expect(cancelGesture({ kind: "view-pan", last: { x: 0, y: 0 } }).effects).toEqual([]);
    expect(cancelGesture(IDLE).effects).toEqual([]);
  });
});

describe("shape helpers", () => {
  it("builds a frame from any drag direction", () => {
    expect(frameFrom({ x: 10, y: 10 }, { x: 30, y: 40 }, false)).toEqual({ x: 10, y: 10, width: 20, height: 30 });
    expect(frameFrom({ x: 30, y: 40 }, { x: 10, y: 10 }, false)).toEqual({ x: 10, y: 10, width: 20, height: 30 });
  });

  it("squares a frame while keeping the drag direction", () => {
    expect(frameFrom({ x: 0, y: 0 }, { x: -50, y: -10 }, true)).toEqual({ x: -50, y: -50, width: 50, height: 50 });
  });

  it("snaps to whichever axis moved further", () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 50, y: 10 })).toEqual({ x: 50, y: 0 });
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 10, y: 50 })).toEqual({ x: 0, y: 50 });
  });

  it("recognises degenerate shapes of each type", () => {
    expect(isDegenerate(createRectLayer({ x: 0, y: 0, width: 1, height: 1 }), 1000)).toBe(true);
    expect(isDegenerate(createRectLayer({ x: 0, y: 0, width: 100, height: 1 }), 1000)).toBe(false);
    expect(isDegenerate(createPathLayer([{ x: 0, y: 0 }]), 1000)).toBe(true);
  });

  it("scales the threshold with the image", () => {
    const small = createRectLayer({ x: 0, y: 0, width: 20, height: 20 });
    expect(isDegenerate(small, 1000)).toBe(false);
    expect(isDegenerate(small, 100000)).toBe(true);
  });
});

describe("pinch and wheel", () => {
  it("measures distance and centre between two pointers", () => {
    expect(pinchFrom({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({ distance: 10, centre: { x: 3, y: 4 } });
  });

  it("turns two pinch samples into a zoom factor and a pan", () => {
    const step = pinchStep(
      { distance: 100, centre: { x: 0, y: 0 } },
      { distance: 150, centre: { x: 10, y: -5 } },
    );
    expect(step.factor).toBeCloseTo(1.5);
    expect(step.delta).toEqual({ x: 10, y: -5 });
  });

  it("never divides by a zero starting distance", () => {
    expect(pinchStep({ distance: 0, centre: { x: 0, y: 0 } }, pinchFrom({ x: 0, y: 0 }, { x: 5, y: 0 })).factor).toBe(1);
  });

  it("zooms in on a negative wheel delta and out on a positive one", () => {
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, false)).toBeLessThan(1);
  });

  it("responds harder to a trackpad pinch than to a wheel", () => {
    expect(wheelZoomFactor(-100, true)).toBeGreaterThan(wheelZoomFactor(-100, false));
  });
});
