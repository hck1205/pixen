import { describe, expect, it } from "vitest";
import { labelledFilename, planVariants, srcset } from "../src/export/variants.js";

const natural = { width: 1600, height: 1200 };

describe("planVariants", () => {
  it("resolves each spec against the size the document exports at", () => {
    expect(planVariants(natural, [{ width: 800 }, { width: 400 }]).map((plan) => plan.size)).toEqual([
      { width: 800, height: 600 },
      { width: 400, height: 300 },
    ]);
  });

  it("labels by width when the caller does not", () => {
    expect(planVariants(natural, [{ width: 800 }])[0]?.label).toBe("800w");
  });

  it("keeps a label the caller chose, because a thumbnail is not a width", () => {
    expect(planVariants(natural, [{ width: 200, label: "thumb" }])[0]?.label).toBe("thumb");
  });

  it("drops a spec that lands on a file already planned", () => {
    // 800px and half of 1600px are the same picture.
    expect(planVariants(natural, [{ width: 800 }, { scale: 0.5 }])).toHaveLength(1);
  });

  it("keeps the same size at another quality, which is a different file", () => {
    // The same pixels, encoded twice: a retina card at 0.9 and a preview at 0.5.
    // Dropping the second returns a plan short of what was asked for, with the
    // sizes matching, so nothing looks wrong until somebody compares the bytes.
    const plans = planVariants(natural, [
      { width: 800, format: "image/webp", quality: 0.9, label: "card" },
      { width: 800, format: "image/webp", quality: 0.5, label: "preview" },
    ]);
    expect(plans.map((plan) => plan.quality)).toEqual([0.9, 0.5]);
    expect(plans.map((plan) => plan.label)).toEqual(["card", "preview"]);
  });

  it("keeps the same size in another format, which is a different file", () => {
    const plans = planVariants(natural, [
      { width: 800, format: "image/webp" },
      { width: 800, format: "image/jpeg" },
    ]);
    expect(plans.map((plan) => plan.format)).toEqual(["image/webp", "image/jpeg"]);
  });

  it("will not enlarge past the source, so a 3200px spec plans the source size", () => {
    expect(planVariants(natural, [{ width: 3200 }])[0]?.size).toEqual(natural);
  });

  it("carries the quality through untouched, including zero", () => {
    expect(planVariants(natural, [{ width: 800, quality: 0.4 }])[0]?.quality).toBe(0.4);
    expect(planVariants(natural, [{ width: 800 }])[0]?.quality).toBeUndefined();
  });
});

describe("labelledFilename", () => {
  it("puts the label before the extension", () => {
    expect(labelledFilename("photo-edited.jpg", "800w")).toBe("photo-edited-800w.jpg");
  });

  it("appends when there is no extension to go before", () => {
    expect(labelledFilename("photo", "800w")).toBe("photo-800w");
  });

  it("leaves a dotfile's leading dot alone", () => {
    expect(labelledFilename(".gitkeep", "800w")).toBe(".gitkeep-800w");
  });
});

describe("srcset", () => {
  it("writes width descriptors, so the browser picks by layout", () => {
    expect(srcset([{ url: "a.jpg", width: 800 }, { url: "b.jpg", width: 400 }])).toBe("a.jpg 800w, b.jpg 400w");
  });

  it("is empty for no variants rather than a stray comma", () => {
    expect(srcset([])).toBe("");
  });
});
