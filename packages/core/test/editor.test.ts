import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArrowLayer,
  createRectLayer,
  Editor,
  PixenError,
  ResourceManager,
  type ImageResource,
} from "@pixen/core";

/** A resource with a stand-in bitmap: document logic never touches the pixels. */
function fakeResource(resources: ResourceManager, width = 1000, height = 500): ImageResource {
  return resources.adopt({
    source: { width, height } as unknown as CanvasImageSource,
    width,
    height,
    mimeType: "image/jpeg",
    name: "sample.jpg",
  });
}

describe("Editor", () => {
  let resources: ResourceManager;
  let editor: Editor;

  beforeEach(() => {
    resources = new ResourceManager();
    editor = new Editor({ resources });
    editor.open(fakeResource(resources));
  });

  it("refuses to mutate before an image is loaded", () => {
    const empty = new Editor();
    expect(() => empty.rotateRight()).toThrowError(PixenError);
    expect(empty.ready).toBe(false);
  });

  it("emits change events with a reason", () => {
    const onChange = vi.fn();
    editor.on("change", onChange);
    editor.rotateRight();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({ reason: "rotate", transient: false });
  });

  it("chains headless edits", async () => {
    editor.crop({ aspectRatio: 1 }).resize({ width: 256 });
    expect(editor.outputSize).toEqual({ width: 256, height: 256 });
  });

  it("undoes a rotate", () => {
    editor.rotateRight();
    expect(editor.document.transform.rotation).toBeCloseTo(Math.PI / 2);
    expect(editor.undo()).toBe(true);
    expect(editor.document.transform.rotation).toBe(0);
    expect(editor.redo()).toBe(true);
    expect(editor.document.transform.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("collapses a drag gesture into a single undo step", () => {
    editor.beginTransaction("Drag crop");
    editor.dragCropHandle("bottom-right", { x: 800, y: 400 });
    editor.dragCropHandle("bottom-right", { x: 600, y: 300 });
    editor.dragCropHandle("bottom-right", { x: 500, y: 250 });
    editor.commitTransaction();

    expect(editor.historyState.depth).toBe(1);
    expect(editor.cropRect.width).toBeCloseTo(500);
    editor.undo();
    expect(editor.document.crop).toBeNull();
  });

  it("marks mid-gesture changes transient", () => {
    const reasons: boolean[] = [];
    editor.on("change", (event) => reasons.push(event.transient));
    editor.beginTransaction("Drag crop");
    editor.dragCropHandle("bottom-right", { x: 800, y: 400 });
    editor.commitTransaction();
    expect(reasons[0]).toBe(true);
  });

  it("rolls a gesture back", () => {
    editor.beginTransaction("Drag crop");
    editor.dragCropHandle("top-left", { x: 300, y: 200 });
    editor.rollbackTransaction();
    expect(editor.document.crop).toBeNull();
    expect(editor.historyState.canUndo).toBe(false);
  });

  it("rolls back when a transaction body throws", () => {
    expect(() =>
      editor.transact("Drag crop", () => {
        editor.dragCropHandle("top-left", { x: 300, y: 200 });
        throw new Error("pointer lost");
      }),
    ).toThrowError("pointer lost");
    expect(editor.document.crop).toBeNull();
  });

  it("keeps selection in step with the layers", () => {
    const layer = createRectLayer({ x: 0, y: 0, width: 100, height: 100 });
    editor.addLayer(layer);
    expect(editor.selection).toBe(layer.id);
    editor.removeLayer(layer.id);
    expect(editor.selection).toBeNull();
  });

  it("drops a selection that an undo removed", () => {
    const layer = createArrowLayer({ x: 0, y: 0 }, { x: 100, y: 100 });
    editor.addLayer(layer);
    editor.undo();
    expect(editor.selectedLayer).toBeNull();
  });

  it("restores a serialised session", async () => {
    editor.crop({ aspectRatio: 16 / 9 }).setAdjustments({ contrast: 0.2 });
    const saved = JSON.parse(JSON.stringify(editor.toJSON()));

    const revived = new Editor({ resources });
    await revived.restore(saved);
    expect(revived.document.aspectRatio).toBeCloseTo(16 / 9);
    expect(revived.document.adjustments.contrast).toBeCloseTo(0.2);
    expect(revived.historyState.canUndo).toBe(false);
  });

  it("explains a restore whose image is gone", async () => {
    const saved = editor.toJSON();
    const orphan = new Editor();
    await expect(orphan.restore(saved)).rejects.toMatchObject({ code: "RESOURCE_MISSING" });
  });

  it("resets to the loaded state in one step", () => {
    editor.rotateRight().setAdjustments({ brightness: 0.5 });
    editor.reset();
    expect(editor.document.transform.rotation).toBe(0);
    expect(editor.document.adjustments.brightness).toBe(0);
    editor.undo();
    expect(editor.document.adjustments.brightness).toBe(0.5);
  });

  it("releases the shared resource on destroy without disposing the manager", () => {
    editor.destroy();
    expect(editor.destroyed).toBe(true);
    expect(() => editor.rotateRight()).toThrowError(/destroyed/);
  });
});
