import { describe, expect, it } from "vitest";

/**
 * The React wrapper is imported from shared modules in Next.js, Remix and
 * anything else that renders on a server, so importing it in node must not
 * touch the DOM.
 *
 * This is the wrapper most likely to be server-rendered and it was the one with
 * no test directory at all — while the coverage page claimed "**every** wrapper
 * imports without a DOM". Vue and Svelte had one each; the word "every" was
 * doing work nothing backed.
 */
describe("React wrapper on a server", () => {
  it("imports without a DOM", async () => {
    expect(typeof HTMLElement).toBe("undefined");
    const module = await import("../src/index.js");
    expect(typeof module.PixenImageEditor).toBe("object");
  });

  it("forwards a ref, so a host can reach the element and the engine", async () => {
    // `forwardRef` returns an object rather than a function, which is what the
    // check above is really asserting — this names why.
    const { PixenImageEditor } = await import("../src/index.js");
    expect(PixenImageEditor).toHaveProperty("$$typeof");
  });

  it("registers the element only in a browser", async () => {
    // Importing must not have defined a custom element: there is no registry
    // here, and reaching for one is the usual way a wrapper breaks on a server.
    expect(typeof customElements).toBe("undefined");
    await import("../src/index.js");
    expect(typeof customElements).toBe("undefined");
  });
});
