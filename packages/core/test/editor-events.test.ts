import { describe, expect, it } from "vitest";
import { Editor, ResourceManager, editorEmissions, type ImageResource } from "@pixen/core";

function fakeResource(resources: ResourceManager): ImageResource {
  return resources.adopt({
    source: { width: 800, height: 600 } as unknown as CanvasImageSource,
    width: 800,
    height: 600,
    mimeType: "image/png",
  });
}

/** Three bytes claiming to be a PNG: enough to get as far as the decoder. */
function undecodableImage(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
}

describe("editorEmissions", () => {
  it("translates a session's events into the ones hosts subscribe to", () => {
    const document = { id: "doc" } as never;
    expect(
      editorEmissions([
        { type: "change", document, reason: "crop", transient: true },
        { type: "selection", id: "layer_1" },
      ]),
    ).toEqual([
      { type: "change", payload: { document, reason: "crop", transient: true } },
      { type: "selection", payload: { id: "layer_1" } },
    ]);
  });

  it("returns nothing for nothing, rather than an empty change", () => {
    expect(editorEmissions([])).toEqual([]);
  });
});

describe("editor task events", () => {
  it("pairs a start with a load", async () => {
    const resources = new ResourceManager();
    const editor = new Editor({ resources });
    const resource = fakeResource(resources);
    const seen: string[] = [];

    editor.on("load-start", (detail) => seen.push(`start:${detail.replace}`));
    editor.on("load", () => seen.push("load"));
    editor.on("error", () => seen.push("error"));

    editor.open(resource);
    await editor.restore(editor.toJSON());
    expect(seen).toEqual(["load", "start:false", "load"]);
  });

  it("announces a failed load on the error channel, not the abort channel", async () => {
    const editor = new Editor();
    const seen: string[] = [];
    editor.on("load-abort", () => seen.push("abort"));
    editor.on("error", (error) => seen.push(`error:${error.code}`));

    await expect(editor.load(undecodableImage())).rejects.toThrow();
    expect(seen).toEqual(["error:INVALID_IMAGE"]);
  });

  it("announces a cancelled load as an abort, and says nothing went wrong", async () => {
    const editor = new Editor();
    const seen: string[] = [];
    editor.on("load-abort", (detail) => seen.push(`abort:${detail.reason}`));
    editor.on("error", () => seen.push("error"));

    const load = editor.load(undecodableImage());
    expect(editor.cancelLoad()).toBe(true);

    await expect(load).rejects.toMatchObject({ code: "ABORTED" });
    expect(seen).toEqual(["abort:cancelled"]);
  });

  it("calls a load off when a second one starts, and says which was which", async () => {
    const editor = new Editor();
    const aborts: string[] = [];
    editor.on("load-abort", (detail) => aborts.push(detail.reason));

    const first = editor.load(undecodableImage());
    const second = editor.load(undecodableImage());

    await expect(first).rejects.toMatchObject({ code: "ABORTED" });
    await expect(second).rejects.toThrow();
    expect(aborts).toEqual(["superseded"]);
  });

  it("has nothing to cancel when nothing is running", () => {
    const editor = new Editor();
    expect(editor.cancelLoad()).toBe(false);
    expect(editor.cancelExport()).toBe(false);
  });
});
