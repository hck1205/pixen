import { describe, expect, it } from "vitest";

/**
 * The Vue wrapper is imported from shared modules in Nuxt and any other Vue
 * setup with server rendering, so importing it in node must not touch the DOM.
 */
describe("Vue wrapper on a server", () => {
  it("imports without a DOM", async () => {
    expect(typeof HTMLElement).toBe("undefined");
    const module = await import("../src/index.js");
    expect(module.PixenImageEditor.name).toBe("PixenImageEditor");
  });

  it("declares the props a host configures it with", async () => {
    const { PixenImageEditor } = await import("../src/index.js");
    const props = Object.keys((PixenImageEditor as unknown as { props: Record<string, unknown> }).props);
    expect(props).toEqual(
      expect.arrayContaining(["src", "document", "tools", "aspectRatios", "policy", "theme", "locale", "format", "quality"]),
    );
  });

  it("declares the events it forwards", async () => {
    const { PixenImageEditor } = await import("../src/index.js");
    const emits = Object.keys((PixenImageEditor as unknown as { emits: Record<string, unknown> }).emits);
    // Against the shared list rather than a copy of it: the point of the list
    // is that a wrapper cannot quietly forward fewer events than it declares.
    const { PIXEN_EVENTS } = await import("@pixen/web");
    expect(emits).toEqual([...PIXEN_EVENTS]);
  });
});
