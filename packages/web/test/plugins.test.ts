import { describe, expect, it, vi } from "vitest";
import { PluginRegistry } from "../src/plugins/registry.js";

const noop = () => {};

/** The ports every one of these gives the registry: nothing but a change signal. */
const ports = (changed: () => void = noop) => ({ changed, locale: () => "en" });

describe("PluginRegistry", () => {
  it("starts with nothing", () => {
    const registry = new PluginRegistry(ports());
    expect(registry.actions).toEqual([]);
    expect(registry.activeSections()).toEqual([]);
  });

  it("tells the chrome to rebuild when something is added", () => {
    const onChange = vi.fn();
    const registry = new PluginRegistry(ports(onChange));
    registry.addAction({ id: "save", label: "Save", onClick: noop });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("removes what a plugin added, and rebuilds again", () => {
    const onChange = vi.fn();
    const registry = new PluginRegistry(ports(onChange));
    const remove = registry.addAction({ id: "save", label: "Save", onClick: noop });
    remove();
    expect(registry.actions).toEqual([]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not rebuild for a removal that removes nothing", () => {
    const onChange = vi.fn();
    const registry = new PluginRegistry(ports(onChange));
    const remove = registry.addAction({ id: "save", label: "Save", onClick: noop });
    remove();
    remove();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("replaces an action added twice under one id", () => {
    const registry = new PluginRegistry(ports());
    registry.addAction({ id: "save", label: "First", onClick: noop });
    registry.addAction({ id: "save", label: "Second", onClick: noop });
    expect(registry.actions.map((action) => action.label)).toEqual(["Second"]);
  });

  it("keeps the order sections were added in", () => {
    const registry = new PluginRegistry(ports());
    registry.addInspectorSection({ id: "a", build: () => [] });
    registry.addInspectorSection({ id: "b", build: () => [] });
    expect(registry.activeSections().map((section) => section.id)).toEqual(["a", "b"]);
  });

  it("asks `when` on every read, so a section can depend on live state", () => {
    const registry = new PluginRegistry(ports());
    let visible = false;
    registry.addInspectorSection({ id: "a", when: () => visible, build: () => [] });
    expect(registry.activeSections()).toHaveLength(0);
    visible = true;
    expect(registry.activeSections()).toHaveLength(1);
  });

  it("runs every teardown, even when one of them throws", () => {
    const registry = new PluginRegistry(ports());
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
    const registry = new PluginRegistry(ports());
    registry.addAction({ id: "save", label: "Save", onClick: noop });
    registry.addInspectorSection({ id: "a", build: () => [] });
    registry.dispose();
    expect(registry.actions).toEqual([]);
    expect(registry.activeSections()).toEqual([]);
  });

  it("ignores a plugin that returned no teardown", () => {
    const registry = new PluginRegistry(ports());
    expect(() => {
      registry.retain(undefined);
      registry.dispose();
    }).not.toThrow();
  });
});

/**
 * An extension shipped as a separate package has labels of its own.
 *
 * Until this existed it had two choices: ship English to everybody, or paste
 * its strings into the editor's own table, where a key collision was one
 * release away. The trim strip in `@pixen/video` is the reason it exists.
 */
describe("a plugin's own strings", () => {
  const TRIM = {
    en: { start: "Start", end: "End" },
    ko: { start: "시작", end: "끝" },
    ja: { start: "開始" },
  };

  const registryOn = (locale: () => string | null) =>
    new PluginRegistry({ changed: () => undefined, locale });

  it("reads the locale the element is on", () => {
    let locale: string | null = "en";
    const text = registryOn(() => locale).addStrings(TRIM);

    expect(text("start")).toBe("Start");
    locale = "ko";
    // The same reader, not a new one: a plugin registers once and the element
    // changes language underneath it.
    expect(text("start")).toBe("시작");
  });

  it("matches a regional tag on its base language, as the editor's own strings do", () => {
    const text = registryOn(() => "ko-KR").addStrings(TRIM);
    expect(text("start")).toBe("시작");
  });

  it("falls back to English for a language the plugin does not carry", () => {
    const text = registryOn(() => "de").addStrings(TRIM);
    expect(text("start")).toBe("Start");
  });

  it("falls back per key, not per language", () => {
    // Japanese here has a start and no end. The end should be English rather
    // than the whole table being discarded for one missing key.
    const text = registryOn(() => "ja").addStrings(TRIM);
    expect(text("start")).toBe("開始");
    expect(text("end")).toBe("End");
  });

  it("reads an unknown key as the key, so a developer can search for it", () => {
    const text = registryOn(() => "en").addStrings(TRIM);
    expect(text("middle")).toBe("middle");
  });

  it("keeps two plugins' keys apart", () => {
    const registry = registryOn(() => "en");
    const trim = registry.addStrings(TRIM);
    const other = registry.addStrings({ en: { start: "Begin" } });
    expect(trim("start")).toBe("Start");
    expect(other("start")).toBe("Begin");
  });
});
