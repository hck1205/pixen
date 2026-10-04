import {
  applyToPoint,
  createScene,
  invert,
  stageToView,
  zoomToFit,
  type Editor,
  type Matrix,
  type Point,
  type Scene,
  type Size,
} from "@pixen/core";

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

/**
 * When the editor is small enough that the chrome lies down under the picture.
 *
 * The stylesheet interpolates these rather than repeating them, so "the two must
 * stay in step" is a fact rather than an instruction — which is what the old
 * comment here asked for and could not enforce. `responsive.ts` records that its
 * own two hand-written copies of the compact rules had already drifted apart
 * once; these three numbers were the same hazard, unfixed.
 */
export const COMPACT_MAX_WIDTH = 560;
export const COMPACT_MAX_HEIGHT = 420;

/**
 * The viewport-width fallback, for an engine with no container queries.
 *
 * Wider than the container breakpoint on purpose: a viewport query cannot tell
 * how much room the editor actually has, so it errs towards the compact layout
 * on a small screen rather than dressing a 360px editor as a desktop.
 */
export const COMPACT_FALLBACK_MAX_WIDTH = 640;

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
 * panel wraps onto a second row — which the adjust panel does.
 *
 * Each piece of chrome is assigned to the edge it will be charged against, and
 * the assignment is *chosen* rather than guessed: every combination is scored by
 * how much room it leaves and the best one wins. Guessing by nearest edge gets
 * the compact layout wrong, where the tool rail lies in the lower middle — as
 * close to the top as to the bottom, but belonging with the inspector below it,
 * whose depth it shares for free.
 */
const EDGES = ["left", "right", "top", "bottom"] as const;

/** Above this many pieces the enumeration is not worth it; no layout has more. */
const MAX_CHROME_PIECES = 6;

export function insetsFromChrome(
  host: EdgeBox,
  chrome: readonly (EdgeBox | null | undefined)[],
  margin = CHROME_MARGIN,
): ViewInsets {
  const boxes = chrome.filter(
    (rect): rect is EdgeBox => Boolean(rect) && rect!.right > rect!.left && rect!.bottom > rect!.top,
  );
  const none: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  if (boxes.length === 0 || boxes.length > MAX_CHROME_PIECES) return none;

  // What each piece would cost on each edge: how far in from that edge you must
  // come before the piece no longer overlaps what is left.
  const costs = boxes.map((rect) => ({
    left: rect.right - host.left + margin,
    right: host.right - rect.left + margin,
    top: rect.bottom - host.top + margin,
    bottom: host.bottom - rect.top + margin,
  }));

  const width = host.right - host.left;
  const height = host.bottom - host.top;

  let best = none;
  let bestScore = -1;
  let bestTotal = Number.POSITIVE_INFINITY;

  const combinations = EDGES.length ** boxes.length;
  for (let choice = 0; choice < combinations; choice += 1) {
    const insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    let index = choice;
    for (const cost of costs) {
      const edge = EDGES[index % EDGES.length]!;
      index = Math.floor(index / EDGES.length);
      insets[edge] = Math.max(insets[edge], cost[edge]);
    }

    const free = Math.max(0, width - insets.left - insets.right) * Math.max(0, height - insets.top - insets.bottom);
    const total = insets.top + insets.right + insets.bottom + insets.left;
    if (free > bestScore || (free === bestScore && total < bestTotal)) {
      best = insets;
      bestScore = free;
      bestTotal = total;
    }
  }

  return best;
}

/**
 * How much backing store a very dense display is allowed to ask for.
 *
 * A phone at four times CSS density would otherwise allocate sixteen times the
 * pixels of a plain one for the same picture, which is where a large image runs
 * out of memory on the devices least able to spare it. Two and a half is past
 * the point where more resolution is visible and well short of that.
 */
const MAX_DEVICE_PIXEL_RATIO = 2.5;

/** The scale to render at on this display. */
export function renderScale(devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
}

/** One press of the zoom buttons. */
export const ZOOM_STEP = 1.25;

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

/**
 * Zooming about a point, which is the arithmetic a wheel and a pinch share.
 *
 * The point under the cursor has to stay under the cursor: scaling about the
 * middle of the canvas instead makes the picture slide away from the finger,
 * which reads as the editor fighting you. So the new zoom is applied, the
 * anchor is asked where it landed, and the pan makes up the difference.
 *
 * Pure, and separate from the viewport, because "does the picture stay under
 * the pointer" is a question about numbers and was previously answerable only
 * by opening a browser and trying it.
 */
export function zoomAt(stage: Size, viewport: Size, view: ViewFit, factor: number, anchor?: Point): ViewFit {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom) return view;
  if (!anchor) return { zoom, pan: view.pan };

  // Where the anchor points to now, and where the same stage point would land
  // at the new zoom with the pan unchanged.
  const before = applyToPoint(invert(stageToView(stage, viewport, view.zoom, view.pan)), anchor);
  const after = applyToPoint(stageToView(stage, viewport, zoom, view.pan), before);
  return { zoom, pan: { x: view.pan.x + (anchor.x - after.x), y: view.pan.y + (anchor.y - after.y) } };
}

/**
 * The scene the viewport draws, which is the same scene the export draws.
 *
 * It is spelled out here rather than inline so the resemblance is checkable:
 * the preview proxy stands in for the source, the host's shape rules are the
 * ones the file will get, and the region is the stage rather than the crop
 * because the viewport shows what is outside the crop as well.
 */
export function viewportScene(editor: Editor, target: Size, matrix: Matrix): Scene {
  const document = editor.document;
  const preview = editor.resources.getPreview(document.source.resourceId);
  return createScene(
    document,
    {
      source: preview.source,
      resolveResource: editor.resources.resolve,
      // The same rules the export will apply, or the picture on screen is not
      // the picture that comes out.
      preprocess: editor.shapeProcessors,
    },
    { region: "stage", target, fit: "none", transform: matrix },
  );
}
