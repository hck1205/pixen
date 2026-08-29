import { describe, expect, it } from "vitest";
import { PreviewProxy, ResourceManager, sourceFromResource } from "@pixen/core";

/**
 * What happens when the manager lets a resource go.
 *
 * `disposeImageSource` can close an `ImageBitmap` and hand a canvas back to the
 * pool, because it can recognise those. Anything else it can only leave alone —
 * so a host that adopted something with a tail has to be able to say so, and
 * the manager has to actually call it. That seam exists because of a leak this
 * repository shipped: a video adopted as a source held an object URL, nothing
 * revoked it, and the whole file stayed in memory for the life of the page.
 */

/** Stands in for a drawable. Nothing here draws; only the bookkeeping is under test. */
const drawable = () => ({ width: 8, height: 6 }) as unknown as CanvasImageSource;

function adopted(dispose?: () => void) {
  const resources = new ResourceManager();
  const resource = resources.adopt({
    source: drawable(),
    width: 8,
    height: 6,
    ...(dispose ? { dispose } : {}),
  });
  return { resources, resource };
}

describe("adopting with a teardown", () => {
  it("runs it when the resource is disposed", () => {
    let closed = 0;
    const { resources, resource } = adopted(() => {
      closed += 1;
    });

    expect(closed).toBe(0);
    resources.dispose(resource.id);
    expect(closed).toBe(1);
  });

  it("runs it exactly once, however many times dispose is called", () => {
    let closed = 0;
    const { resources, resource } = adopted(() => {
      closed += 1;
    });

    resources.dispose(resource.id);
    resources.dispose(resource.id);
    expect(closed).toBe(1);
  });

  it("runs it when everything is disposed at once", () => {
    let closed = 0;
    const { resources } = adopted(() => {
      closed += 1;
    });

    resources.disposeAll();
    expect(closed).toBe(1);
  });

  it("finishes releasing even when the host's teardown throws", () => {
    // A host that threw in here would otherwise leak the entry the manager was
    // trying to clean up after — the opposite of what the callback is for.
    const { resources, resource } = adopted(() => {
      throw new Error("the host's problem, not ours");
    });

    expect(() => resources.dispose(resource.id)).not.toThrow();
    expect(() => resources.require(resource.id)).toThrow();
  });

  it("is optional, because most sources have no tail to clean up", () => {
    const { resources, resource } = adopted();
    expect(() => resources.dispose(resource.id)).not.toThrow();
  });
});

describe("releasing by reference count", () => {
  it("keeps the resource until the last holder lets go", () => {
    let closed = 0;
    const { resources, resource } = adopted(() => {
      closed += 1;
    });

    resources.retain(resource.id);
    resources.release(resource.id);
    expect(closed).toBe(0);

    resources.release(resource.id);
    expect(closed).toBe(1);
  });
});

describe("the preview proxy", () => {
  const size = { width: 4000, height: 3000 };

  it("costs nothing until one is asked for", () => {
    const proxy = new PreviewProxy(drawable(), size, false);
    expect(proxy.bytes()).toBe(0);
  });

  it("costs nothing when the source is already small enough to be its own proxy", () => {
    // The plan says "source" rather than "render", so there is no second bitmap
    // — which is a different reason for zero than "none has been made yet", and
    // the same answer.
    const small = { width: 64, height: 48 };
    const proxy = new PreviewProxy(drawable(), small, false);
    const bitmap = proxy.get(1024);
    expect(bitmap.source).toBe(proxy.get(1024).source);
    expect({ width: bitmap.width, height: bitmap.height }).toEqual(small);
    expect(proxy.bytes()).toBe(0);
  });

  it("never proxies a moving source, however large it is", () => {
    // A downscaled copy of a video is one frame of it, held forever.
    const proxy = new PreviewProxy(drawable(), size, true);
    const bitmap = proxy.get(256);
    expect({ width: bitmap.width, height: bitmap.height }).toEqual(size);
    expect(proxy.bytes()).toBe(0);
  });
});

/**
 * The one conversion from a registered bitmap to what a document stores.
 *
 * Three places used to spell it out, which is what `sourceFromResource` was
 * written to stop — and one of them, `processImage`, was still spelling it out
 * afterwards and had never been told about `duration`. A document made that way
 * described a video as a picture with no length. This is the check that keeps
 * the conversion honest as the descriptor grows a field.
 */
describe("a resource, as the descriptor a document stores", () => {
  const registered = (extra: Record<string, unknown> = {}) =>
    new ResourceManager().adopt({ source: drawable(), width: 8, height: 6, ...extra });

  it("carries the id and the numbers every edit is measured against", () => {
    const resource = registered();
    expect(sourceFromResource(resource)).toMatchObject({
      resourceId: resource.id,
      width: 8,
      height: 6,
    });
  });

  it("carries the provenance a filename is built from", () => {
    const descriptor = sourceFromResource(registered({ name: "holiday.jpg", mimeType: "image/jpeg" }));
    expect(descriptor).toMatchObject({ name: "holiday.jpg", mimeType: "image/jpeg" });
  });

  it("carries how long a moving source runs for", () => {
    expect(sourceFromResource(registered({ duration: 12.5 })).duration).toBe(12.5);
  });

  it("leaves out what the resource does not know, rather than saying undefined", () => {
    // The descriptor is stored as JSON, where an absent key and a key holding
    // `undefined` are not the same document.
    expect(Object.keys(sourceFromResource(registered()))).toEqual(["resourceId", "width", "height"]);
  });
});
