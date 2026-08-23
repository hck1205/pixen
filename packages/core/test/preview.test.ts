import { describe, expect, it } from "vitest";
import { ResourceManager } from "../src/resources/manager.js";
import { planPreview } from "../src/resources/preview.js";

const huge = { width: 8000, height: 6000 };

describe("planPreview", () => {
  it("downscales a large source to the longest edge asked for", () => {
    expect(planPreview(huge, 2048, null)).toEqual({ kind: "render", target: { width: 2048, height: 1536 } });
  });

  it("uses the source itself when it is already inside the limit", () => {
    // Copying it would cost a second full-size bitmap and change nothing.
    expect(planPreview({ width: 800, height: 600 }, 2048, null)).toEqual({ kind: "source" });
  });

  it("keeps a proxy built for a larger limit rather than re-rendering it smaller", () => {
    expect(planPreview(huge, 512, 2048)).toEqual({ kind: "cached" });
  });

  it("keeps one built for exactly the limit asked for", () => {
    expect(planPreview(huge, 2048, 2048)).toEqual({ kind: "cached" });
  });

  it("re-renders when the proxy on hand is smaller than what is wanted", () => {
    // The other direction is the one that puts a blurry picture on screen.
    expect(planPreview(huge, 2048, 512)).toEqual({ kind: "render", target: { width: 2048, height: 1536 } });
  });

  it("fits the longer edge, whichever it is", () => {
    expect(planPreview({ width: 600, height: 8000 }, 1000, null)).toEqual({
      kind: "render",
      target: { width: 75, height: 1000 },
    });
  });
});

describe("ResourceManager previews", () => {
  /** Sizes only: the preview path never looks at the pixels in node. */
  function adopt(resources: ResourceManager, size = { width: 800, height: 600 }) {
    return resources.adopt({
      source: size as unknown as CanvasImageSource,
      ...size,
      mimeType: "image/png",
    });
  }

  it("hands back the same proxy for a repeated request", () => {
    const resources = new ResourceManager();
    const { id } = adopt(resources);
    expect(resources.getPreview(id)).toBe(resources.getPreview(id));
  });

  it("uses the source itself when the image is already small", () => {
    const resources = new ResourceManager();
    const resource = adopt(resources);
    const preview = resources.getPreview(resource.id);

    expect(preview.source).toBe(resource.source);
    expect({ width: preview.width, height: preview.height }).toEqual({ width: 800, height: 600 });
  });

  it("refuses a preview of a resource that is not registered", () => {
    expect(() => new ResourceManager().getPreview("res_missing")).toThrow(/not registered|No resource/);
  });
});
