import { describe, expect, it } from "vitest";
import {
  createRectLayer,
  createTextLayer,
  preprocessLayer,
  preprocessLayers,
  type EditorLayer,
  type PreprocessContext,
  type ShapeProcessor,
} from "@pixen/core";

/**
 * The host's chance to rewrite a shape before it is drawn.
 *
 * Not a render hook — a processor never sees a canvas. It is a rule about
 * shapes, and the two rules that make it safe are what this file pins: it runs
 * over a copy on the way to the renderer, so the stored document is untouched;
 * and it is told whether this is the preview or the file, because "not in the
 * export" and "not on screen" are both things a host wants to say.
 */
const context: PreprocessContext = {
  preview: false,
  transform: { rotation: 0, flipX: false, flipY: false },
  scale: 1,
};

const rect = () => createRectLayer({ x: 0, y: 0, width: 10, height: 10 });
const text = () => createTextLayer({ x: 0, y: 0 }, "hello");

describe("one processor", () => {
  it("leaves a layer alone when it does not claim it", () => {
    const notMine: ShapeProcessor = () => undefined;
    const layer = rect();
    expect(preprocessLayer(layer, [notMine], context)).toEqual([layer]);
  });

  it("replaces a claimed layer with whatever it returned", () => {
    const double: ShapeProcessor = (layer) => [layer, { ...layer, id: `${layer.id}_copy` }];
    expect(preprocessLayer(rect(), [double], context).map((layer) => layer.id)).toHaveLength(2);
  });

  it("can remove a layer by claiming it and returning nothing", () => {
    const drop: ShapeProcessor = (layer) => (layer.type === "text" ? [] : undefined);
    expect(preprocessLayers([rect(), text()], [drop], context).map((layer) => layer.type)).toEqual(["rect"]);
  });

  it("never touches the layer it was given", () => {
    const recolour: ShapeProcessor = (layer) =>
      layer.type === "rect" ? [{ ...layer, color: "#00ff00" }] : undefined;
    const original = rect();
    const before = JSON.stringify(original);
    preprocessLayer(original, [recolour], context);
    // The stored document is what undo restores; a processor that edited it in
    // place would make undo restore something nobody chose.
    expect(JSON.stringify(original)).toBe(before);
  });
});

describe("a chain", () => {
  const tag = (name: string): ShapeProcessor => (layer) => [{ ...layer, id: `${layer.id}-${name}` }];

  it("carries on past a processor that passed", () => {
    // What lets a host hand over a list of narrow rules rather than one that
    // has to recognise everything: the first that says "not mine" is not the
    // end of the chain.
    const passes: ShapeProcessor = () => undefined;
    const [layer] = preprocessLayer(rect(), [passes, tag("b")], context);
    expect(layer!.id.endsWith("-b")).toBe(true);
  });

  it("runs in order, each over what the last produced", () => {
    const [layer] = preprocessLayer(rect(), [tag("a"), tag("b")], context);
    expect(layer!.id.endsWith("-a-b")).toBe(true);
  });

  it("runs the rest of the chain over each shape an earlier one produced", () => {
    const split: ShapeProcessor = (layer) => [layer, { ...layer, id: `${layer.id}_二` }];
    const produced = preprocessLayer(rect(), [split, tag("after")], context);
    expect(produced).toHaveLength(2);
    for (const layer of produced) expect(layer.id.endsWith("-after")).toBe(true);
  });

  it("does not run a processor over its own output", () => {
    // The alternative — every processor over the original, concatenated —
    // doubles a shape the moment two of them match it.
    let calls = 0;
    const once: ShapeProcessor = (layer) => {
      calls += 1;
      return [layer, layer];
    };
    preprocessLayer(rect(), [once], context);
    expect(calls).toBe(1);
  });

  it("is a no-op with no processors, and does not copy for nothing", () => {
    const layer = rect();
    expect(preprocessLayer(layer, [], context)[0]).toBe(layer);
  });
});

describe("what a processor is told", () => {
  it("knows whether this is the preview or the file", () => {
    const seen: boolean[] = [];
    const watcher: ShapeProcessor = (layer, given) => {
      seen.push(given.preview);
      return [layer];
    };
    preprocessLayer(rect(), [watcher], { ...context, preview: true });
    preprocessLayer(rect(), [watcher], { ...context, preview: false });
    expect(seen).toEqual([true, false]);
  });

  it("can hide a placeholder from the file and leave it on screen", () => {
    const draft: ShapeProcessor = (layer, given) =>
      layer.type === "text" && !given.preview ? [] : undefined;
    const layers: EditorLayer[] = [rect(), text()];
    expect(preprocessLayers(layers, [draft], { ...context, preview: true })).toHaveLength(2);
    expect(preprocessLayers(layers, [draft], { ...context, preview: false })).toHaveLength(1);
  });
});
