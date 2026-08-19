import { zoomToFit, type Point, type Size } from "@pixen/core";

/**
 * View fitting, kept pure.
 *
 * The chrome floats over the canvas, so fitting to the raw viewport tucks the
 * bottom of the image under the inspector and the left edge under the tool rail.
 * Fitting to the area the chrome leaves free is what makes "fit" actually mean
 * fit — and expressing it as a function of sizes keeps it testable.
 */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Roughly the space the floating chrome occupies, including its margins. */
export const CHROME_INSETS: ViewInsets = { top: 60, right: 60, bottom: 80, left: 70 };

/**
 * The compact layout puts the tool rail below the image next to the inspector,
 * so the space it needs moves from the left edge to the bottom.
 */
export const COMPACT_INSETS: ViewInsets = { top: 52, right: 12, bottom: 132, left: 12 };

/** Matches the container query in `styles.ts`; the two must stay in step. */
export const COMPACT_MAX_WIDTH = 560;
export const COMPACT_MAX_HEIGHT = 420;

export function isCompactViewport(viewport: Size): boolean {
  return viewport.width <= COMPACT_MAX_WIDTH || viewport.height <= COMPACT_MAX_HEIGHT;
}

/** The insets the chrome is assumed to occupy when it cannot be measured. */
export function insetsFor(viewport: Size): ViewInsets {
  return isCompactViewport(viewport) ? COMPACT_INSETS : CHROME_INSETS;
}

/** A rectangle as the DOM reports it, so a measurement can be passed in as data. */
export interface EdgeBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Breathing room left between the image and the chrome it is fitted around. */
const CHROME_MARGIN = 12;

/**
 * The insets a measured chrome actually occupies.
 *
 * The constants above are a guess, and a guess stops being true the moment a
 * panel wraps onto a second row — which the adjust panel does. Each piece of
 * chrome is charged to the edge it is docked nearest, so a taller inspector
 * simply reserves more of the bottom.
 */
export function insetsFromChrome(
  host: EdgeBox,
  chrome: readonly (EdgeBox | null | undefined)[],
  margin = CHROME_MARGIN,
): ViewInsets {
  const insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  for (const rect of chrome) {
    if (!rect || rect.right <= rect.left || rect.bottom <= rect.top) continue;

    const distance: ViewInsets = {
      left: rect.left - host.left,
      right: host.right - rect.right,
      top: rect.top - host.top,
      bottom: host.bottom - rect.bottom,
    };
    const edges = ["left", "right", "top", "bottom"] as const;
    const edge = edges.reduce((closest, key) => (distance[key] < distance[closest] ? key : closest));

    const depth =
      edge === "left"
        ? rect.right - host.left
        : edge === "right"
          ? host.right - rect.left
          : edge === "top"
            ? rect.bottom - host.top
            : host.bottom - rect.top;

    insets[edge] = Math.max(insets[edge], depth + margin);
  }

  return insets;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 12;

/** Below this, insets are dropped: on a tiny host, chrome overlap beats no image. */
export const MIN_FREE_SIZE = 120;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export interface ViewFit {
  zoom: number;
  /** Offset from the viewport centre, in CSS pixels. */
  pan: Point;
}

/**
 * The zoom and pan that centre `stage` inside the part of `viewport` the chrome
 * leaves free.
 */
export function fitView(stage: Size, viewport: Size, insets: ViewInsets = insetsFor(viewport)): ViewFit {
  const free: Size = {
    width: viewport.width - insets.left - insets.right,
    height: viewport.height - insets.top - insets.bottom,
  };

  // A short host has no room for insets; overlapping chrome is better than an
  // image scaled down to nothing.
  const useInsets = free.width >= MIN_FREE_SIZE && free.height >= MIN_FREE_SIZE;
  const box = useInsets ? free : viewport;

  return {
    zoom: clampZoom(zoomToFit(stage, box)),
    pan: useInsets
      ? { x: (insets.left - insets.right) / 2, y: (insets.top - insets.bottom) / 2 }
      : { x: 0, y: 0 },
  };
}
