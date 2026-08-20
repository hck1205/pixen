import { describe, expect, it, vi } from "vitest";
import { applyAttribute, type AttributePorts } from "../src/element/attributes.js";

function ports(over: Partial<AttributePorts> = {}): AttributePorts & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    mounted: () => true,
    ready: () => true,
    load: (src) => calls.push(`load:${src}`),
    defer: (src) => calls.push(`defer:${src}`),
    setFormat: (format) => calls.push(`format:${format}`),
    setQuality: (quality) => calls.push(`quality:${quality}`),
    setLocale: (locale) => calls.push(`locale:${locale}`),
    setPreset: (preset) => calls.push(`preset:${preset}`),
    refresh: () => calls.push("refresh"),
    ...over,
  };
}

describe("applyAttribute", () => {
  it("loads a source once there is somewhere to render it", () => {
    const p = ports();
    applyAttribute("src", "/photo.jpg", p);
    expect(p.calls).toEqual(["load:/photo.jpg"]);
  });

  it("holds a source set before the element is mounted", () => {
    const p = ports({ mounted: () => false });
    applyAttribute("src", "/photo.jpg", p);
    expect(p.calls).toEqual(["defer:/photo.jpg"]);
  });

  it("ignores an empty source rather than loading nothing", () => {
    const p = ports();
    applyAttribute("src", null, p);
    expect(p.calls).toEqual([]);
  });

  it("applies output settings only once there is a document to apply them to", () => {
    const applied = ports();
    applyAttribute("format", "image/webp", applied);
    applyAttribute("quality", "0.6", applied);
    expect(applied.calls).toEqual(["format:image/webp", "quality:0.6"]);

    const empty = ports({ ready: () => false });
    applyAttribute("format", "image/webp", empty);
    applyAttribute("quality", "0.6", empty);
    expect(empty.calls).toEqual([]);
  });

  it("clears the preset when the attribute is removed", () => {
    const p = ports();
    applyAttribute("preset", null, p);
    expect(p.calls).toEqual(["preset:null"]);
  });

  it("treats a theme as pure CSS: re-read the state, change nothing else", () => {
    const p = ports();
    applyAttribute("theme", "dark", p);
    expect(p.calls).toEqual(["refresh"]);
  });

  it("passes the locale through even when it is cleared, so it falls back", () => {
    const p = ports();
    applyAttribute("locale", null, p);
    expect(p.calls).toEqual(["locale:null"]);
  });

  it("does nothing for an attribute that carries no value it understands", () => {
    const refresh = vi.fn();
    applyAttribute("theme", null, ports({ refresh }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
