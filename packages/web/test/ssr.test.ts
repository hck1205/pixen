import { describe, expect, it } from "vitest";

/**
 * These tests run in node, with no DOM at all — which is exactly the environment
 * a server-rendered page imports the package from. Importing must not touch
 * `HTMLElement`, `window` or `customElements`, or every SSR framework breaks at
 * the import statement rather than at render time.
 */
describe("server-side import", () => {
  it("has no DOM to accidentally rely on", () => {
    expect(typeof HTMLElement).toBe("undefined");
    expect(typeof window).toBe("undefined");
    expect(typeof customElements).toBe("undefined");
  });

  it("imports the package without throwing", async () => {
    const module = await import("../src/index.js");
    expect(typeof module.PixenImageEditorElement).toBe("function");
    expect(typeof module.definePixenImageEditor).toBe("function");
  });

  it("registration is a no-op instead of an error", async () => {
    const { definePixenImageEditor } = await import("../src/index.js");
    expect(() => definePixenImageEditor()).not.toThrow();
  });

  it("exposes the pure helpers a server may legitimately want", async () => {
    const { fitView, zoomLabel, DEFAULT_TOOLS } = await import("../src/index.js");
    expect(fitView({ width: 100, height: 100 }, { width: 500, height: 500 }).zoom).toBeGreaterThan(0);
    expect(zoomLabel(1)).toBe("100%");
    expect(DEFAULT_TOOLS.length).toBeGreaterThan(0);
  });
});
