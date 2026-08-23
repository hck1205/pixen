import { describe, expect, it } from "vitest";
import {
  createDocument,
  createRectLayer,
  createSession,
  documentChangeFor,
  historyOf,
  isErr,
  pruneSelection,
  reduce,
  reduceAll,
  type Intent,
  type SessionEvent,
  type SessionState,
  type StepName,
} from "@pixen/core";

const QUARTER = Math.PI / 2;

function session(): SessionState {
  return createSession(createDocument({ resourceId: "res_1", width: 1000, height: 500 }));
}

function layer(id: string) {
  return createRectLayer({ x: 10, y: 10, width: 100, height: 100 }, { id });
}

/** Applies intents and returns the final state, failing loudly on an error. */
function run(state: SessionState, ...intents: Intent[]): SessionState {
  const result = reduceAll(state, intents);
  if (!result.ok) throw result.error;
  return result.value.state;
}

function eventsOf(state: SessionState, intent: Intent): readonly SessionEvent[] {
  const result = reduce(state, intent);
  if (!result.ok) throw result.error;
  return result.value.events;
}

describe("intent to command mapping", () => {
  it("names every document intent for the undo stack", () => {
    // The name, not the wording: the engine says which step this is, and
    // whoever shows it says so in the reader's own language.
    const cases: Array<[Intent, string, StepName]> = [
      [{ kind: "rotate-by", radians: 1 }, "rotate", "rotate"],
      [{ kind: "rotate-quarter-turns", turns: 1 }, "rotate", "rotate"],
      [{ kind: "flip", axis: "x" }, "flip", "flipHorizontal"],
      [{ kind: "flip", axis: "y" }, "flip", "flipVertical"],
      [{ kind: "set-crop", rect: null }, "crop", "resetCrop"],
      [{ kind: "pan-crop", delta: { x: 0, y: 0 } }, "crop-pan", "moveCrop"],
      [{ kind: "set-aspect-ratio", ratio: 1 }, "aspect-ratio", "aspectRatio"],
      [{ kind: "set-adjustments", adjustments: {} }, "adjustments", "adjust"],
      [{ kind: "resize", resize: { width: 100 } }, "resize", "resize"],
      [{ kind: "remove-layer", id: "x" }, "layer-remove", "deleteLayer"],
      [{ kind: "reset" }, "reset", "reset"],
    ];

    for (const [intent, reason, step] of cases) {
      const change = documentChangeFor(intent);
      expect(change, intent.kind).not.toBeNull();
      expect(change!.reason, intent.kind).toBe(reason);
      expect(change!.step, intent.kind).toBe(step);
      // A named step carries no wording of its own, or the two could disagree.
      expect(change!.label, intent.kind).toBeUndefined();
    }
  });

  it("distinguishes setting a crop from clearing it", () => {
    const set = documentChangeFor({ kind: "set-crop", rect: { x: 0, y: 0, width: 10, height: 10 } });
    expect(set!.step).toBe("crop");
  });

  it("has no command for the control intents", () => {
    expect(documentChangeFor({ kind: "undo" })).toBeNull();
    expect(documentChangeFor({ kind: "select", id: null })).toBeNull();
    expect(documentChangeFor({ kind: "begin-transaction", label: "x" })).toBeNull();
  });

  it("carries a custom transform through with its own label", () => {
    const change = documentChangeFor({
      kind: "transform",
      reason: "plugin",
      label: "Background removal",
      transform: (document) => document,
    });
    expect(change!.reason).toBe("plugin");
    expect(change!.label).toBe("Background removal");
  });
});

describe("reduce", () => {
  it("is pure: the input state is never mutated", () => {
    const initial = session();
    const snapshot = JSON.stringify(initial);
    run(initial, { kind: "rotate-quarter-turns", turns: 1 });
    expect(JSON.stringify(initial)).toBe(snapshot);
  });

  it("applies a document command and records it", () => {
    const state = run(session(), { kind: "rotate-quarter-turns", turns: 1 });
    expect(state.document.transform.rotation).toBeCloseTo(QUARTER);
    expect(historyOf(state).depth).toBe(1);
    expect(historyOf(state).undoLabel).toBe("Rotate");
  });

  it("emits a change and a history event for a recorded change", () => {
    const events = eventsOf(session(), { kind: "rotate-quarter-turns", turns: 1 });
    expect(events.map((event) => event.type)).toEqual(["change", "history"]);
    expect(events[0]).toMatchObject({ reason: "rotate", transient: false });
  });

  it("emits nothing when a command changes nothing", () => {
    const events = eventsOf(session(), { kind: "reorder-layer", id: "missing", index: 0 });
    expect(events).toEqual([]);
  });

  it("rejects an unknown intent with a stable code", () => {
    const result = reduce(session(), { kind: "teleport" } as unknown as Intent);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("INVALID_STATE");
  });

  it("computes a resize from the current crop", () => {
    const state = run(
      session(),
      { kind: "set-crop", rect: { x: 0, y: 0, width: 800, height: 400 } },
      { kind: "resize", resize: { width: 400 } },
    );
    expect(state.document.output).toMatchObject({ width: 400, height: 200 });
  });

  it("clones a replacement document so the host keeps no handle on state", () => {
    const replacement = createDocument({ resourceId: "res_2", width: 10, height: 10 });
    const state = run(session(), { kind: "set-document", document: replacement });
    replacement.source.width = 999;
    expect(state.document.source.width).toBe(10);
  });
});

describe("transactions", () => {
  it("marks mid-gesture changes transient and records one step", () => {
    const opened = run(session(), { kind: "begin-transaction", label: "Drag crop" });
    const dragged = run(
      opened,
      { kind: "drag-crop-handle", handle: "bottom-right", pointer: { x: 800, y: 400 } },
      { kind: "drag-crop-handle", handle: "bottom-right", pointer: { x: 600, y: 300 } },
    );
    expect(historyOf(dragged).depth).toBe(0);

    const events = eventsOf(dragged, { kind: "commit-transaction" });
    expect(events.some((event) => event.type === "change" && event.transient)).toBe(false);

    const committed = run(dragged, { kind: "commit-transaction" });
    expect(historyOf(committed).depth).toBe(1);
  });

  it("reports transient on every change inside the gesture", () => {
    const opened = run(session(), { kind: "begin-transaction", label: "Drag crop" });
    const events = eventsOf(opened, {
      kind: "drag-crop-handle",
      handle: "bottom-right",
      pointer: { x: 700, y: 350 },
    });
    expect(events).toEqual([
      expect.objectContaining({ type: "change", reason: "crop-drag", transient: true }),
    ]);
  });

  it("restores the pre-gesture document on rollback", () => {
    const opened = run(session(), { kind: "begin-transaction", label: "Drag crop" });
    const dragged = run(opened, {
      kind: "drag-crop-handle",
      handle: "top-left",
      pointer: { x: 300, y: 200 },
    });
    const rolledBack = run(dragged, { kind: "rollback-transaction" });

    expect(rolledBack.document.crop).toBeNull();
    expect(historyOf(rolledBack).canUndo).toBe(false);
  });

  it("emits a change on commit only when the gesture moved something", () => {
    const opened = run(session(), { kind: "begin-transaction", label: "Drag crop" });
    expect(eventsOf(opened, { kind: "commit-transaction" }).map((e) => e.type)).toEqual(["history"]);
  });

  it("refuses to nest, commit without opening, or undo mid-gesture", () => {
    const opened = run(session(), { kind: "begin-transaction", label: "Drag" });
    expect(isErr(reduce(opened, { kind: "begin-transaction", label: "Other" }))).toBe(true);
    expect(isErr(reduce(session(), { kind: "commit-transaction" }))).toBe(true);
    expect(isErr(reduce(session(), { kind: "rollback-transaction" }))).toBe(true);
    expect(isErr(reduce(opened, { kind: "undo" }))).toBe(true);
  });
});

describe("undo and redo", () => {
  it("steps back and forward through recorded changes", () => {
    const state = run(session(), { kind: "rotate-quarter-turns", turns: 1 });
    const undone = run(state, { kind: "undo" });
    expect(undone.document.transform.rotation).toBe(0);

    const redone = run(undone, { kind: "redo" });
    expect(redone.document.transform.rotation).toBeCloseTo(QUARTER);
  });

  it("does nothing, and says nothing, on an empty stack", () => {
    expect(eventsOf(session(), { kind: "undo" })).toEqual([]);
    expect(eventsOf(session(), { kind: "redo" })).toEqual([]);
  });

  it("restores the ratio a quarter turn had inverted", () => {
    const state = run(
      session(),
      { kind: "set-aspect-ratio", ratio: 16 / 9 },
      { kind: "rotate-quarter-turns", turns: 1 },
    );
    expect(state.document.aspectRatio).toBeCloseTo(9 / 16);

    const undone = run(state, { kind: "undo" });
    expect(undone.document.aspectRatio).toBeCloseTo(16 / 9);
  });
});

describe("selection", () => {
  it("selects a layer as it is added", () => {
    const state = run(session(), { kind: "add-layer", layer: layer("a") });
    expect(state.selection).toBe("a");
  });

  it("can add without selecting", () => {
    const state = run(session(), { kind: "add-layer", layer: layer("a"), select: false });
    expect(state.selection).toBeNull();
  });

  it("emits the selection alongside the change", () => {
    const events = eventsOf(session(), { kind: "add-layer", layer: layer("a") });
    expect(events.map((event) => event.type)).toEqual(["change", "history", "selection"]);
  });

  it("clears the selection when its layer is removed", () => {
    const added = run(session(), { kind: "add-layer", layer: layer("a") });
    const removed = run(added, { kind: "remove-layer", id: "a" });
    expect(removed.selection).toBeNull();
  });

  it("drops a selection that an undo removed", () => {
    const added = run(session(), { kind: "add-layer", layer: layer("a") });
    const undone = run(added, { kind: "undo" });
    expect(undone.selection).toBeNull();
    expect(undone.document.layers).toEqual([]);
  });

  it("refuses to select a layer that does not exist", () => {
    const state = run(session(), { kind: "select", id: "ghost" });
    expect(state.selection).toBeNull();
  });

  it("says nothing when the selection does not change", () => {
    const added = run(session(), { kind: "add-layer", layer: layer("a") });
    expect(eventsOf(added, { kind: "select", id: "a" })).toEqual([]);
  });

  it("keeps the selection through an unrelated edit", () => {
    const state = run(
      session(),
      { kind: "add-layer", layer: layer("a") },
      { kind: "rotate-quarter-turns", turns: 1 },
    );
    expect(state.selection).toBe("a");
  });
});

describe("layer intents", () => {
  it("patches a layer with data", () => {
    const state = run(
      session(),
      { kind: "add-layer", layer: layer("a") },
      { kind: "update-layer", id: "a", patch: { opacity: 0.5 } },
    );
    expect(state.document.layers[0]).toMatchObject({ opacity: 0.5 });
  });

  it("moves a layer in image space", () => {
    const state = run(
      session(),
      { kind: "add-layer", layer: layer("a") },
      { kind: "move-layer", id: "a", delta: { x: 5, y: -5 } },
    );
    expect(state.document.layers[0]).toMatchObject({ frame: { x: 15, y: 5 } });
  });

  it("reorders layers", () => {
    const state = run(
      session(),
      { kind: "add-layer", layer: layer("a") },
      { kind: "add-layer", layer: layer("b") },
      { kind: "reorder-layer", id: "b", index: 0 },
    );
    expect(state.document.layers.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("inserts at an explicit index", () => {
    const state = run(
      session(),
      { kind: "add-layer", layer: layer("a") },
      { kind: "add-layer", layer: layer("b"), index: 0 },
    );
    expect(state.document.layers.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("pruneSelection", () => {
  it("keeps a live selection and drops a dead one", () => {
    const document = { ...createDocument({ resourceId: "r", width: 1, height: 1 }), layers: [layer("a")] };
    expect(pruneSelection(document, "a")).toBe("a");
    expect(pruneSelection(document, "b")).toBeNull();
    expect(pruneSelection(document, null)).toBeNull();
  });
});

describe("reduceAll", () => {
  it("stops at the first failure and reports it", () => {
    const result = reduceAll(session(), [
      { kind: "rotate-quarter-turns", turns: 1 },
      { kind: "commit-transaction" },
      { kind: "rotate-quarter-turns", turns: 1 },
    ]);
    expect(isErr(result)).toBe(true);
  });

  it("accumulates the events of every applied intent", () => {
    const result = reduceAll(session(), [
      { kind: "rotate-quarter-turns", turns: 1 },
      { kind: "flip", axis: "x" },
    ]);
    if (!result.ok) throw result.error;
    expect(result.value.events.filter((event) => event.type === "change")).toHaveLength(2);
  });
});
