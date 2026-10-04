/** A gesture from pointer-down to pointer-up: what it becomes, what it emits, and how it ends. */
import { describe, expect, it } from "vitest";
import { createPathLayer, createRectLayer, scaling, type EditorLayer } from "@pixen/core";
import { beginGesture, cancelGesture, endGesture, IDLE, moveGesture, type GestureState } from "../../src/viewport/gestures/index.js";
import { DEFAULT_STYLE } from "../../src/tools/index.js";
import { context, intents, kinds, at } from "./fixture.js";

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
    // The transaction opens here and is closed by whoever owns the editor, so
    // creating a text layer and typing into it is one undo step.
    expect(kinds(outcome.effects)).toEqual([
      "intent:begin-transaction",
      "intent:add-layer",
      "select-tool",
      "focus-text",
    ]);

    const [, added] = intents(outcome.effects);
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
      {
        kind: "update-layer",
        id: "a",
        patch: { frame: { x: 40, y: 60, width: 60, height: 40 }, cornerRadius: 0 },
      },
    ]);
  });

  it("grows a rectangle's rounding with the drag, since it is a fraction of it", () => {
    const state: GestureState = { kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "rect" };
    const rounded = context({ style: { ...DEFAULT_STYLE, cornerRatio: 0.25 } });
    // A radius fixed when the drag began would be wrong by the time it ended.
    const small = intents(moveGesture(state, at(40, 40), rounded).effects)[0];
    const large = intents(moveGesture(state, at(200, 200), rounded).effects)[0];
    expect(small).toMatchObject({ patch: { cornerRadius: 10 } });
    expect(large).toMatchObject({ patch: { cornerRadius: 50 } });
  });

  it("leaves other shapes without a radius they do not have", () => {
    const state: GestureState = { kind: "draw-shape", id: "a", origin: { x: 0, y: 0 }, tool: "ellipse" };
    expect(intents(moveGesture(state, at(40, 40), context()).effects)[0]).toEqual({
      kind: "update-layer",
      id: "a",
      patch: { frame: { x: 0, y: 0, width: 40, height: 40 } },
    });
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
