import { describe, expect, it, vi } from "vitest";
import { applyProperties, applyProperty, attachEvents, eventTypeFor, PIXEN_EVENTS } from "../src/bindings/index.js";
import type { PixenImageEditorElement } from "../src/element/index.js";

/** A stand-in for the element: records what a wrapper did to it. */
function fakeElement() {
  const listeners = new Map<string, Set<EventListener>>();
  const calls: Array<[string, unknown]> = [];

  const element = {
    tools: null as unknown,
    aspectRatios: null as unknown,
    policy: null as unknown,
    document: null as unknown,
    setAttribute: (name: string, value: string) => calls.push(["setAttribute", `${name}=${value}`]),
    load: (input: unknown) => {
      calls.push(["load", input]);
      return Promise.resolve();
    },
    addEventListener: (type: string, listener: EventListener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: EventListener) => listeners.get(type)?.delete(listener),
  };

  const emit = (type: string, detail: unknown) => {
    for (const listener of listeners.get(type) ?? []) listener({ detail } as unknown as Event);
  };

  return { element: element as unknown as PixenImageEditorElement, calls, emit, listeners };
}

describe("event names", () => {
  it("namespaces the bare names for the DOM", () => {
    expect(eventTypeFor("export")).toBe("pixen-export");
    expect(PIXEN_EVENTS).toEqual([
      "ready",
      "load-start",
      "load-progress",
      "load-abort",
      "load",
      "change",
      "history",
      "export-start",
      "export-progress",
      "export-abort",
      "export",
      "error",
    ]);
  });
});

describe("attachEvents", () => {
  it("delivers the detail, not the event", () => {
    const { element, emit } = fakeElement();
    const onExport = vi.fn();
    attachEvents(element, { export: onExport });

    emit("pixen-export", { bytes: 1234 });
    expect(onExport).toHaveBeenCalledWith({ bytes: 1234 });
  });

  it("subscribes only to the handlers given", () => {
    const { element, listeners } = fakeElement();
    attachEvents(element, { load: vi.fn() });
    expect([...listeners.keys()]).toEqual(["pixen-load"]);
  });

  it("returns one function that removes every listener", () => {
    const { element, emit, listeners } = fakeElement();
    const onLoad = vi.fn();
    const onError = vi.fn();
    const detach = attachEvents(element, { load: onLoad, error: onError });

    detach();
    emit("pixen-load", {});
    emit("pixen-error", {});

    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("is safe to attach nothing", () => {
    const { element, listeners } = fakeElement();
    expect(() => attachEvents(element, {})()).not.toThrow();
    expect(listeners.size).toBe(0);
  });
});

describe("applyProperty", () => {
  it("sets a URL through the attribute, so the element can dedupe reloads", () => {
    const { element, calls } = fakeElement();
    applyProperty(element, "src", "/photo.jpg");
    expect(calls).toEqual([["setAttribute", "src=/photo.jpg"]]);
  });

  it("loads a Blob imperatively, since an attribute cannot carry one", () => {
    const { element, calls } = fakeElement();
    const blob = new Blob(["x"]);
    applyProperty(element, "src", blob);
    expect(calls).toEqual([["load", blob]]);
  });

  it("does nothing for a property the host did not mention", () => {
    const { element, calls } = fakeElement();
    applyProperty(element, "src", undefined);
    applyProperty(element, "tools", undefined);
    expect(calls).toEqual([]);
    expect(element.tools).toBeNull();
  });

  it("assigns structured values as properties", () => {
    const { element } = fakeElement();
    applyProperty(element, "tools", ["crop"]);
    applyProperty(element, "aspectRatios", [1, null]);
    expect(element.tools).toEqual(["crop"]);
    expect(element.aspectRatios).toEqual([1, null]);
  });

  it("clears a policy when the host passes null", () => {
    const { element } = fakeElement();
    applyProperty(element, "policy", "profile");
    expect(element.policy).toBe("profile");
    applyProperty(element, "policy", null);
    expect(element.policy).toBeNull();
  });
});

describe("applyProperties", () => {
  it("configures the element before handing it the image", () => {
    const { element, calls } = fakeElement();
    applyProperties(element, { src: "/photo.jpg", tools: ["crop"], policy: "profile" });

    expect(element.tools).toEqual(["crop"]);
    expect(element.policy).toBe("profile");
    // The image is loaded last, so it decodes against the final configuration.
    expect(calls).toEqual([["setAttribute", "src=/photo.jpg"]]);
  });

  it("ignores an empty set of props", () => {
    const { element, calls } = fakeElement();
    applyProperties(element, {});
    expect(calls).toEqual([]);
  });

  /**
   * The shared path has to carry every property `applyProperty` knows about, or
   * a wrapper that uses it gets a prop that silently does nothing.
   *
   * That is not hypothetical: `stickers` was handled by `applyProperty` and
   * never reached from here, so a Svelte host — which only ever calls this —
   * passed stickers and got an empty panel with nothing to debug. Vue lost the
   * initial value for the same reason and recovered on the next change. React
   * was fine only because it lists all six itself and bypasses this.
   */
  it("carries every property the single-property path handles", () => {
    const { element } = fakeElement();
    applyProperties(element, {
      src: "/photo.jpg",
      tools: ["crop"],
      aspectRatios: [1],
      stickers: ["/star.svg"],
      policy: "profile",
      document: null,
    });

    expect(element.tools).toEqual(["crop"]);
    expect(element.aspectRatios).toEqual([1]);
    expect(element.stickers).toEqual(["/star.svg"]);
    expect(element.policy).toBe("profile");
  });
});
