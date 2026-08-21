import { describe, expect, it } from "vitest";
import { PreviewProxy, ResourceManager } from "@pixen/core";

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
    expect(bitmap.scale).toBe(1);
    expect(proxy.bytes()).toBe(0);
  });

  it("never proxies a moving source, however large it is", () => {
    // A downscaled copy of a video is one frame of it, held forever.
    const proxy = new PreviewProxy(drawable(), size, true);
    const bitmap = proxy.get(256);
    expect(bitmap.width).toBe(size.width);
    expect(bitmap.scale).toBe(1);
    expect(proxy.bytes()).toBe(0);
  });
});
