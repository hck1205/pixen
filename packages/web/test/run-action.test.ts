import { describe, expect, it } from "vitest";
import { createRectLayer, createTextLayer, type Editor, type EditorLayer } from "@pixen/core";
import { runKeyboardAction, type ActionPorts } from "../src/element/input/run-action.js";

const frame = { x: 0, y: 0, width: 10, height: 10 };

/** Only what the actions touch; anything else being reached is a test failure. */
function ports(selected: EditorLayer | null = null) {
  const calls: string[] = [];
  const editor = {
    get selectedLayer() {
      return selected;
    },
    document: { source: { width: 1600, height: 1200 } },
    select: (id: string | null) => calls.push(`select:${id}`),
    removeLayer: (id: string) => calls.push(`remove:${id}`),
    moveLayer: (id: string, delta: { x: number; y: number }) => calls.push(`move:${id}:${delta.x},${delta.y}`),
  } as unknown as Editor;

  const port: ActionPorts = {
    editor,
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
    zoomToFit: () => calls.push("fit"),
    selectTool: (tool) => calls.push(`tool:${tool}`),
    editText: (layer) => calls.push(`edit:${layer.id}`),
  };
  return { port, calls };
}

describe("runKeyboardAction", () => {
  it("passes the history and view actions straight through", () => {
    const { port, calls } = ports();
    runKeyboardAction({ kind: "undo" }, port);
    runKeyboardAction({ kind: "redo" }, port);
    runKeyboardAction({ kind: "zoom-to-fit" }, port);
    runKeyboardAction({ kind: "select-tool", tool: "rect" }, port);
    expect(calls).toEqual(["undo", "redo", "fit", "tool:rect"]);
  });

  it("clears the selection whether or not there is one", () => {
    const { port, calls } = ports();
    runKeyboardAction({ kind: "clear-selection" }, port);
    expect(calls).toEqual(["select:null"]);
  });

  it("deletes the selected layer, and nothing when there is none", () => {
    const withOne = ports(createRectLayer(frame, { id: "a" }));
    runKeyboardAction({ kind: "delete-selection" }, withOne.port);
    expect(withOne.calls).toEqual(["remove:a"]);

    const withNone = ports();
    runKeyboardAction({ kind: "delete-selection" }, withNone.port);
    expect(withNone.calls).toEqual([]);
  });

  it("opens the text editor only for text", () => {
    const text = ports(createTextLayer({ x: 0, y: 0 }, "hi", { id: "t" }));
    runKeyboardAction({ kind: "edit-text" }, text.port);
    expect(text.calls).toEqual(["edit:t"]);

    const shape = ports(createRectLayer(frame, { id: "r" }));
    runKeyboardAction({ kind: "edit-text" }, shape.port);
    expect(shape.calls).toEqual([]);
  });

  it("nudges by a fraction of the image, so the same key moves the same relative distance", () => {
    const { port, calls } = ports(createRectLayer(frame, { id: "a" }));
    runKeyboardAction({ kind: "nudge", direction: { x: 1, y: 0 }, fast: false }, port);
    const [entry] = calls;
    const distance = Number(entry?.split(":")[2]?.split(",")[0]);
    expect(distance).toBeGreaterThan(0);

    const fast = ports(createRectLayer(frame, { id: "a" }));
    runKeyboardAction({ kind: "nudge", direction: { x: 1, y: 0 }, fast: true }, fast.port);
    const fastDistance = Number(fast.calls[0]?.split(":")[2]?.split(",")[0]);
    expect(fastDistance).toBeGreaterThan(distance);
  });

  it("nudges nothing when nothing is selected", () => {
    const { port, calls } = ports();
    runKeyboardAction({ kind: "nudge", direction: { x: 1, y: 0 }, fast: false }, port);
    expect(calls).toEqual([]);
  });
});
