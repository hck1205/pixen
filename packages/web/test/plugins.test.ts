import { describe, expect, it, vi } from "vitest";
import { PluginRegistry } from "../src/plugins/registry.js";

const noop = () => {};

describe("PluginRegistry", () => {
  it("starts with nothing", () => {
    const registry = new PluginRegistry(noop);
    expect(registry.actions).toEqual([]);
    expect(registry.activeSections()).toEqual([]);
  });

  it("tells the chrome to rebuild when something is added", () => {
    const onChange = vi.fn();
    const registry = new PluginRegistry(onChange);
    registry.addAction({ id: "save", label: "Save", onClick: noop });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("removes what a plugin added, and rebuilds again", () => {
    const onChange = vi.fn();
    const registry = new PluginRegistry(onChange);
    const remove = registry.addAction({ id: "save", label: "Save", onClick: noop });
    remove();
    expect(registry.actions).toEqual([]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not rebuild for a removal that removes nothing", () => {
    const onChange = vi.fn();
    const registry = new PluginRegistry(onChange);
    const remove = registry.addAction({ id: "save", label: "Save", onClick: noop });
    remove();
    remove();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("replaces an action added twice under one id", () => {
    const registry = new PluginRegistry(noop);
    registry.addAction({ id: "save", label: "First", onClick: noop });
    registry.addAction({ id: "save", label: "Second", onClick: noop });
    expect(registry.actions.map((action) => action.label)).toEqual(["Second"]);
  });

  it("keeps the order sections were added in", () => {
    const registry = new PluginRegistry(noop);
    registry.addInspectorSection({ id: "a", build: () => [] });
    registry.addInspectorSection({ id: "b", build: () => [] });
    expect(registry.activeSections().map((section) => section.id)).toEqual(["a", "b"]);
  });

  it("asks `when` on every read, so a section can depend on live state", () => {
    const registry = new PluginRegistry(noop);
    let visible = false;
    registry.addInspectorSection({ id: "a", when: () => visible, build: () => [] });
    expect(registry.activeSections()).toHaveLength(0);
    visible = true;
    expect(registry.activeSections()).toHaveLength(1);
  });

  it("runs every teardown, even when one of them throws", () => {
    const registry = new PluginRegistry(noop);
    const after = vi.fn();
    registry.retain(() => {
      throw new Error("plugin fell over");
    });
    registry.retain(after);

    expect(() => registry.dispose()).not.toThrow();
    // Half-cleanup is worse than the error, so the next plugin still runs.
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("forgets everything on dispose", () => {
    const registry = new PluginRegistry(noop);
    registry.addAction({ id: "save", label: "Save", onClick: noop });
    registry.addInspectorSection({ id: "a", build: () => [] });
    registry.dispose();
    expect(registry.actions).toEqual([]);
    expect(registry.activeSections()).toEqual([]);
  });

  it("ignores a plugin that returned no teardown", () => {
    const registry = new PluginRegistry(noop);
    expect(() => {
      registry.retain(undefined);
      registry.dispose();
    }).not.toThrow();
  });
});
