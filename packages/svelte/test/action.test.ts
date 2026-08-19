import { describe, expect, it, vi } from "vitest";
import { pixen } from "../src/index.js";

/**
 * A stand-in for the element: an action is a contract about `update` and
 * `destroy`, so it can be checked without a DOM or a Svelte compiler.
 */
function fakeElement() {
  const listeners = new Map<string, EventListener[]>();
  const applied: Array<[string, unknown]> = [];

  const element = {
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    },
    setAttribute(name: string, value: string) {
      applied.push([name, value]);
    },
    hasAttribute: () => false,
    set tools(value: unknown) {
      applied.push(["tools", value]);
    },
    set policy(value: unknown) {
      applied.push(["policy", value]);
    },
    emit(type: string, detail: unknown) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ detail } as unknown as Event);
      }
    },
    listenerCount: () => [...listeners.values()].reduce((total, list) => total + list.length, 0),
  };

  return { element, applied };
}

describe("the pixen action", () => {
  it("applies structured properties on attach", () => {
    const { element, applied } = fakeElement();
    pixen(element as never, { src: "/photo.jpg", tools: ["crop"] });
    expect(applied).toContainEqual(["src", "/photo.jpg"]);
    expect(applied).toContainEqual(["tools", ["crop"]]);
  });

  it("re-applies them when the values change", () => {
    const { element, applied } = fakeElement();
    const action = pixen(element as never, { tools: ["crop"] });
    action.update({ tools: ["crop", "redact"] });
    expect(applied.filter(([key]) => key === "tools")).toHaveLength(2);
  });

  it("forwards events to the current handler", () => {
    const { element } = fakeElement();
    const first = vi.fn();
    const second = vi.fn();

    const action = pixen(element as never, { export: first });
    element.emit("pixen-export", { bytes: 10 });
    expect(first).toHaveBeenCalledTimes(1);

    action.update({ export: second });
    element.emit("pixen-export", { bytes: 20 });
    // The new handler is called, and the old one is not called again.
    expect(second).toHaveBeenCalledWith({ bytes: 20 });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("subscribes once, however many times the props change", () => {
    const { element } = fakeElement();
    const action = pixen(element as never, {});
    const before = element.listenerCount();
    action.update({ export: () => {} });
    action.update({ export: () => {} });
    expect(element.listenerCount()).toBe(before);
  });

  it("picks up a handler that was not there at first", () => {
    const { element } = fakeElement();
    const late = vi.fn();
    const action = pixen(element as never, {});
    action.update({ load: late });
    element.emit("pixen-load", { document: {} });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("removes every listener on destroy", () => {
    const { element } = fakeElement();
    const handler = vi.fn();
    const action = pixen(element as never, { export: handler });
    action.destroy();
    element.emit("pixen-export", {});
    expect(handler).not.toHaveBeenCalled();
    expect(element.listenerCount()).toBe(0);
  });
});
