import { describe, expect, it } from "vitest";
import {
  describeSupport,
  getSupportReport,
  probePlatform,
  summariseSupport,
  type PlatformProbe,
} from "@pixen/core";

/** A browser with everything, as the baseline for the cases below. */
function modern(overrides: Partial<PlatformProbe> = {}): PlatformProbe {
  return {
    canvas2d: true,
    createImageBitmap: true,
    imageElement: true,
    offscreenCanvas: true,
    canvasFilter: true,
    roundRect: true,
    structuredClone: true,
    blobArrayBuffer: true,
    customElements: true,
    shadowDom: true,
    pointerEvents: true,
    resizeObserver: true,
    containerQueries: true,
    ...overrides,
  };
}

describe("describeSupport", () => {
  it("reports full support on a current browser", () => {
    const report = describeSupport(modern());
    expect(report.level).toBe("full");
    expect(report.engine.degradations).toEqual([]);
    expect(report.ui.degradations).toEqual([]);
  });

  it("degrades rather than fails without OffscreenCanvas", () => {
    const report = describeSupport(modern({ offscreenCanvas: false }));
    expect(report.level).toBe("degraded");
    expect(report.engine.blockers).toEqual([]);
    expect(report.engine.degradations.map((entry) => entry.feature)).toEqual(["offscreenCanvas"]);
  });

  it("explains each degradation in terms of what the user will see", () => {
    const report = describeSupport(modern({ canvasFilter: false }));
    expect(report.engine.degradations[0]!.consequence).toMatch(/per pixel/);
  });

  it("accepts an <img> decoder in place of createImageBitmap", () => {
    const report = describeSupport(modern({ createImageBitmap: false, imageElement: true }));
    expect(report.engine.degradations.map((entry) => entry.feature)).not.toContain("createImageBitmap");
    expect(report.level).toBe("full");
  });

  it("degrades when neither decoder is available", () => {
    const report = describeSupport(modern({ createImageBitmap: false, imageElement: false }));
    expect(report.engine.degradations.map((entry) => entry.feature)).toContain("createImageBitmap");
  });

  it("blocks the engine only when there is no canvas at all", () => {
    const report = describeSupport(modern({ canvas2d: false }));
    expect(report.engine.level).toBe("unsupported");
    expect(report.engine.blockers[0]!.reason).toMatch(/2D canvas/);
    expect(report.level).toBe("unsupported");
  });

  it("blocks the UI without custom elements, while the engine still works", () => {
    const report = describeSupport(modern({ customElements: false }));
    expect(report.ui.level).toBe("unsupported");
    expect(report.engine.level).toBe("full");
    expect(report.level).toBe("unsupported");
  });

  it("keeps the headless engine usable when only the shadow DOM is missing", () => {
    const report = describeSupport(modern({ shadowDom: false }));
    expect(report.engine.level).toBe("full");
    expect(report.ui.blockers.map((entry) => entry.feature)).toEqual(["shadowDom"]);
  });

  it("treats a missing ResizeObserver as a UI degradation", () => {
    const report = describeSupport(modern({ resizeObserver: false }));
    expect(report.ui.degradations.map((entry) => entry.feature)).toEqual(["resizeObserver"]);
    expect(report.engine.level).toBe("full");
  });

  it("warns that EXIF orientation is lost without Blob.arrayBuffer", () => {
    const report = describeSupport(modern({ blobArrayBuffer: false }));
    expect(report.engine.degradations[0]!.consequence).toMatch(/sideways/);
  });

  it("collects several degradations at once", () => {
    const report = describeSupport(
      modern({ offscreenCanvas: false, canvasFilter: false, roundRect: false, containerQueries: false }),
    );
    expect(report.engine.degradations).toHaveLength(3);
    expect(report.ui.degradations).toHaveLength(1);
  });

  it("is pure: the probe is not modified", () => {
    const probe = modern({ canvasFilter: false });
    const snapshot = JSON.stringify(probe);
    describeSupport(probe);
    expect(JSON.stringify(probe)).toBe(snapshot);
  });
});

describe("summariseSupport", () => {
  it("says so plainly when everything is present", () => {
    expect(summariseSupport(describeSupport(modern()))).toBe("Pixen: fully supported");
  });

  it("names the fallbacks in play", () => {
    expect(summariseSupport(describeSupport(modern({ canvasFilter: false })))).toMatch(
      /supported with fallbacks \(canvasFilter\)/,
    );
  });

  it("names what is missing when unsupported", () => {
    expect(summariseSupport(describeSupport(modern({ canvas2d: false })))).toBe(
      "Pixen: unsupported (missing canvas2d)",
    );
  });
});

describe("probePlatform", () => {
  it("reports an empty environment without throwing — this suite runs in node", () => {
    const probe = probePlatform();
    expect(probe.customElements).toBe(false);
    expect(probe.canvas2d).toBe(false);
    expect(probe.containerQueries).toBe(false);
  });

  it("reads capabilities from the scope it is given", () => {
    const scope = {
      Image: class {},
      structuredClone: () => undefined,
      customElements: {},
      PointerEvent: class {},
      ResizeObserver: class {},
      Element: { prototype: { attachShadow() {} } },
      Blob: { prototype: { arrayBuffer() {} } },
      CSS: { supports: () => true },
    } as unknown as typeof globalThis;

    const probe = probePlatform(scope);
    expect(probe).toMatchObject({
      imageElement: true,
      structuredClone: true,
      customElements: true,
      shadowDom: true,
      pointerEvents: true,
      resizeObserver: true,
      blobArrayBuffer: true,
      containerQueries: true,
      canvas2d: false,
    });
  });

  it("survives a scope whose CSS.supports throws", () => {
    const scope = {
      CSS: {
        supports() {
          throw new Error("nope");
        },
      },
    } as unknown as typeof globalThis;
    expect(probePlatform(scope).containerQueries).toBe(false);
  });

  it("produces a report for the current environment without throwing", () => {
    expect(["full", "degraded", "unsupported"]).toContain(getSupportReport().level);
  });
});
