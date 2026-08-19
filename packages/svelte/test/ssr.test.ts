import { describe, expect, it } from "vitest";

/**
 * The action ships with the element's side-effect import, which registers a
 * custom element — something a server has no registry for. Importing it must
 * still be safe, or every SvelteKit page that touches the module breaks before
 * it renders.
 */
describe("Svelte bindings on a server", () => {
  it("imports without a DOM", async () => {
    expect(typeof globalThis.document).toBe("undefined");
    const module = await import("../src/index.js");
    expect(typeof module.pixen).toBe("function");
  });
});
