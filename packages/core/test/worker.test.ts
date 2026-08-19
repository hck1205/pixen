import { describe, expect, it } from "vitest";
import { imageWorkerBody } from "../src/image/worker/body.js";
import { isWorkerResponse, transfersFor, transfersForResponse } from "../src/image/worker/protocol.js";
import { ImageWorker } from "../src/image/worker/client.js";

describe("the worker protocol", () => {
  it("transfers the pixel buffer rather than copying it", () => {
    const pixels = new ArrayBuffer(64);
    const transfers = transfersFor({
      id: 1,
      kind: "encode",
      pixels,
      width: 4,
      height: 4,
      format: "image/jpeg",
      quality: 0.8,
    });
    expect(transfers).toEqual([pixels]);
  });

  it("has nothing to transfer for a decode request", () => {
    expect(transfersFor({ id: 1, kind: "decode", blob: new Blob() })).toEqual([]);
  });

  it("transfers the bitmap back", () => {
    const bitmap = {} as ImageBitmap;
    expect(
      transfersForResponse({ id: 1, ok: true, kind: "decode", bitmap, width: 2, height: 2 }),
    ).toEqual([bitmap]);
    expect(transfersForResponse({ id: 1, ok: false, message: "no" })).toEqual([]);
  });

  it("recognises a reply, and refuses anything else on the same channel", () => {
    expect(isWorkerResponse({ id: 1, ok: true, kind: "encode", blob: new Blob() })).toBe(true);
    expect(isWorkerResponse({ id: 1, ok: false, message: "boom" })).toBe(true);
    // A stray message from something else sharing the worker must not be
    // mistaken for a reply and resolve someone's promise.
    expect(isWorkerResponse({ id: 1, ok: true, kind: "something-else" })).toBe(false);
    expect(isWorkerResponse({ ok: true, kind: "decode" })).toBe(false);
    expect(isWorkerResponse("hello")).toBe(false);
    expect(isWorkerResponse(null)).toBe(false);
  });
});

describe("the worker body", () => {
  it("is self-contained, because only its own text is serialised", () => {
    // It ships as `(${body})()` inside a blob, so a reference to anything
    // outside itself would be undefined at run time.
    // Its own name is in the text; what must not be is anything it would have
    // to import — those become undefined once only the body crosses over.
    const source = imageWorkerBody.toString();
    for (const forbidden of ["PixenError", "transfersFor(", "isWorkerResponse", "import ", "require("]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("decodes with orientation left to Pixen, or the image turns twice", () => {
    expect(imageWorkerBody.toString()).toContain('imageOrientation: "none"');
  });
});

describe("the worker client", () => {
  it("reports the environment honestly, and degrades rather than throwing", async () => {
    // Node has no Worker or OffscreenCanvas; the client must say so and then
    // return null so callers do the work themselves.
    expect(ImageWorker.available).toBe(false);
    const worker = new ImageWorker();
    expect(worker.ready).toBe(false);
    expect(await worker.decode(new Blob())).toBeNull();
    expect(await worker.encode(new ArrayBuffer(4), 1, 1, "image/jpeg", 0.8)).toBeNull();
    worker.dispose();
  });
});
