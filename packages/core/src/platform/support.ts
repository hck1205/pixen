/**
 * What this engine can and cannot do, as data.
 *
 * Pixen is built to run on browsers older than the APIs it would prefer, by
 * degrading rather than failing: an engine without `OffscreenCanvas` gets a DOM
 * canvas, one without canvas `filter` gets a pixel pass, one without
 * `createImageBitmap` gets an `<img>` decode. This module makes that policy
 * inspectable, so a host can decide up front — show the editor, show a simpler
 * upload control, or warn — instead of discovering the answer mid-export.
 */
export interface PlatformProbe {
  /** A 2D canvas context can be created at all. Without it nothing renders. */
  canvas2d: boolean;
  createImageBitmap: boolean;
  /** `<img>` decoding, the fallback when `createImageBitmap` is missing. */
  imageElement: boolean;
  offscreenCanvas: boolean;
  /** `CanvasRenderingContext2D.filter`. */
  canvasFilter: boolean;
  roundRect: boolean;
  structuredClone: boolean;
  blobArrayBuffer: boolean;
  /** The three the custom element needs. */
  customElements: boolean;
  shadowDom: boolean;
  pointerEvents: boolean;
  resizeObserver: boolean;
  containerQueries: boolean;
}

export type SupportLevel = "full" | "degraded" | "unsupported";

export interface Degradation {
  feature: keyof PlatformProbe;
  /** What the user will actually experience. */
  consequence: string;
}

export interface Blocker {
  feature: keyof PlatformProbe;
  reason: string;
}

export interface SurfaceReport {
  level: SupportLevel;
  blockers: Blocker[];
  degradations: Degradation[];
}

export interface SupportReport {
  /** The worst of the two surfaces below. */
  level: SupportLevel;
  /** `@pixen/core` on its own: decode, edit, export. */
  engine: SurfaceReport;
  /** The `<pixen-image-editor>` element. */
  ui: SurfaceReport;
}

/** Features without which the headless engine cannot work at all. */
const ENGINE_BLOCKERS: Array<{ feature: keyof PlatformProbe; reason: string }> = [
  { feature: "canvas2d", reason: "Rendering and export both draw through a 2D canvas context" },
];

/** Features the element needs before it can register itself. */
const UI_BLOCKERS: Array<{ feature: keyof PlatformProbe; reason: string }> = [
  { feature: "customElements", reason: "The editor is distributed as a custom element" },
  { feature: "shadowDom", reason: "The editor's styles and chrome live in a shadow root" },
];

const ENGINE_DEGRADATIONS: Degradation[] = [
  {
    feature: "offscreenCanvas",
    consequence: "Rendering uses a DOM canvas, which cannot be moved off the main thread",
  },
  {
    feature: "canvasFilter",
    consequence: "Colour adjustments run per pixel, which is slower on large exports",
  },
  {
    feature: "createImageBitmap",
    consequence: "Images decode through an <img> element, which is slower and uses more memory",
  },
  { feature: "roundRect", consequence: "Rounded annotation corners render square" },
  { feature: "structuredClone", consequence: "Document snapshots clone through JSON, which is slower" },
  { feature: "blobArrayBuffer", consequence: "EXIF orientation cannot be read, so rotated photos may load sideways" },
];

const UI_DEGRADATIONS: Degradation[] = [
  { feature: "resizeObserver", consequence: "The view does not re-fit automatically when the editor is resized" },
  {
    feature: "containerQueries",
    consequence: "The compact layout keys on the viewport, so a small editor on a large page keeps the desktop chrome",
  },
  { feature: "pointerEvents", consequence: "Touch and pen input are unavailable; mouse input still works" },
];

function assess(
  probe: PlatformProbe,
  blockers: Array<{ feature: keyof PlatformProbe; reason: string }>,
  degradations: Degradation[],
): SurfaceReport {
  const failed = blockers.filter((blocker) => !probe[blocker.feature]);
  const degraded = degradations.filter((degradation) => !probe[degradation.feature]);

  return {
    level: failed.length > 0 ? "unsupported" : degraded.length > 0 ? "degraded" : "full",
    blockers: failed,
    degradations: degraded,
  };
}

/** Pure: the same probe always produces the same report. */
export function describeSupport(probe: PlatformProbe): SupportReport {
  const engineProbe: PlatformProbe = {
    ...probe,
    // Either decoder is enough; the report should not blame a missing
    // createImageBitmap on an engine that has <img>.
    createImageBitmap: probe.createImageBitmap || probe.imageElement,
  };

  const engine = assess(engineProbe, ENGINE_BLOCKERS, ENGINE_DEGRADATIONS);
  const ui = assess(probe, UI_BLOCKERS, UI_DEGRADATIONS);
  const level: SupportLevel =
    engine.level === "unsupported" || ui.level === "unsupported"
      ? "unsupported"
      : engine.level === "degraded" || ui.level === "degraded"
        ? "degraded"
        : "full";

  return { level, engine, ui };
}

/** Reads the current environment. Safe to call on a server, where it reports nothing. */
export function probePlatform(scope: typeof globalThis = globalThis): PlatformProbe {
  const global = scope as unknown as Record<string, unknown>;
  const has = (name: string): boolean => typeof global[name] !== "undefined";

  const context = probeContext(scope);

  return {
    canvas2d: context !== null,
    createImageBitmap: typeof global.createImageBitmap === "function",
    imageElement: has("Image"),
    offscreenCanvas: has("OffscreenCanvas"),
    canvasFilter: context ? probeFilter(context) : false,
    roundRect: context ? typeof context.roundRect === "function" : false,
    structuredClone: typeof global.structuredClone === "function",
    blobArrayBuffer: has("Blob") && typeof (global.Blob as { prototype?: Blob })?.prototype?.arrayBuffer === "function",
    customElements: has("customElements"),
    shadowDom: has("Element") && "attachShadow" in ((global.Element as { prototype?: object })?.prototype ?? {}),
    pointerEvents: has("PointerEvent"),
    resizeObserver: has("ResizeObserver"),
    containerQueries: probeContainerQueries(scope),
  };
}

function probeContext(scope: typeof globalThis): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  const global = scope as unknown as Record<string, unknown>;
  try {
    if (typeof global.OffscreenCanvas === "function") {
      const canvas = new (global.OffscreenCanvas as typeof OffscreenCanvas)(1, 1);
      return canvas.getContext("2d");
    }
    const documentRef = global.document as Document | undefined;
    if (documentRef?.createElement) {
      return documentRef.createElement("canvas").getContext("2d");
    }
  } catch {
    return null;
  }
  return null;
}

function probeFilter(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): boolean {
  try {
    const previous = context.filter;
    context.filter = "brightness(1.5)";
    const supported = context.filter !== "none" && context.filter !== "";
    context.filter = previous ?? "none";
    return supported;
  } catch {
    return false;
  }
}

function probeContainerQueries(scope: typeof globalThis): boolean {
  const supports = (scope as unknown as { CSS?: { supports?: (property: string, value: string) => boolean } }).CSS;
  try {
    return supports?.supports?.("container-type", "size") ?? false;
  } catch {
    return false;
  }
}

/** The report for the current environment. */
export function getSupportReport(): SupportReport {
  return describeSupport(probePlatform());
}

/** One-line summary, for logs and support tickets. */
export function summariseSupport(report: SupportReport): string {
  if (report.level === "full") return "Pixen: fully supported";
  const blockers = [...report.engine.blockers, ...report.ui.blockers].map((entry) => entry.feature);
  if (blockers.length > 0) return `Pixen: unsupported (missing ${blockers.join(", ")})`;
  const degraded = [...report.engine.degradations, ...report.ui.degradations].map((entry) => entry.feature);
  return `Pixen: supported with fallbacks (${degraded.join(", ")})`;
}
