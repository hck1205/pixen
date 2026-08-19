import { describe, expect, it } from "vitest";
import { createRectLayer } from "@pixen/core";
import { styleWriter } from "../src/element/chrome/inspector/style-writer.js";
import type { ChromeContext } from "../src/element/chrome/context.js";

const layer = createRectLayer({ x: 0, y: 0, width: 10, height: 10 }, { id: "a" });

function context() {
  const calls: string[] = [];
  const fake = {
    actions: { setAnnotationStyle: (patch: unknown) => calls.push(`style:${JSON.stringify(patch)}`) },
    editor: { updateLayer: (id: string, patch: unknown) => calls.push(`layer:${id}:${JSON.stringify(patch)}`) },
  } as unknown as ChromeContext;
  return { fake, calls };
}

describe("styleWriter", () => {
  it("always writes the palette, so the next annotation inherits the choice", () => {
    const { fake, calls } = context();
    styleWriter(fake, null)({ colour: "#fff" });
    expect(calls).toEqual(['style:{"colour":"#fff"}']);
  });

  it("writes the selected layer too, because changing a colour with a shape selected means that shape", () => {
    const { fake, calls } = context();
    styleWriter(fake, layer)({ colour: "#fff" }, { fill: "#fff" });
    expect(calls).toEqual(['style:{"colour":"#fff"}', 'layer:a:{"fill":"#fff"}']);
  });

  it("leaves the layer alone when the control has nothing to say about it", () => {
    const { fake, calls } = context();
    styleWriter(fake, layer)({ dashed: true });
    expect(calls).toEqual(['style:{"dashed":true}']);
  });

  it("leaves the layer alone when the caller narrowed it away", () => {
    // The redaction controls pass null unless a *redaction* is selected, so a
    // rectangle that happens to be selected never receives `{ mode }`.
    const { fake, calls } = context();
    styleWriter(fake, null)({ redactionMode: "blur" }, { mode: "blur" });
    expect(calls).toEqual(['style:{"redactionMode":"blur"}']);
  });
});
