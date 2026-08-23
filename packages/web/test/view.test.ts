import { describe, expect, it } from "vitest";
import { applyToPoint, invert, stageToView } from "@pixen/core";
import type { ViewFit } from "../src/viewport/view.js";
import { responsive } from "../src/theme/styles/responsive.js";
import {
  zoomAt,
  CHROME_INSETS,
  clampZoom,
  COMPACT_INSETS,
  COMPACT_FALLBACK_MAX_WIDTH,
  COMPACT_MAX_HEIGHT,
  insetsFromChrome,
  COMPACT_MAX_WIDTH,
  fitView,
  insetsFor,
  isCompactViewport,
  MAX_ZOOM,
  MIN_FREE_SIZE,
  MIN_ZOOM,
} from "../src/viewport/view.js";

const stage = { width: 1600, height: 1000 };

describe("clampZoom", () => {
  it("keeps a sane zoom untouched", () => {
    expect(clampZoom(0.5)).toBe(0.5);
  });

  it("clamps to the limits", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
  });

  it("falls back to 1 for a nonsense value", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("insetsFor", () => {
  it("uses the desktop chrome on a roomy host", () => {
    expect(insetsFor({ width: 1200, height: 800 })).toEqual(CHROME_INSETS);
    expect(isCompactViewport({ width: 1200, height: 800 })).toBe(false);
  });

  it("switches to the compact chrome when the host is narrow", () => {
    expect(insetsFor({ width: COMPACT_MAX_WIDTH, height: 900 })).toEqual(COMPACT_INSETS);
  });

  it("switches when the host is short, however wide it is", () => {
    expect(insetsFor({ width: 1600, height: COMPACT_MAX_HEIGHT })).toEqual(COMPACT_INSETS);
  });

  it("reserves the bottom rather than the left once compact", () => {
    expect(COMPACT_INSETS.bottom).toBeGreaterThan(COMPACT_INSETS.left);
    expect(COMPACT_INSETS.left).toBeLessThan(CHROME_INSETS.left);
  });
});

describe("fitView", () => {
  it("fits inside the space the chrome leaves free, not the whole viewport", () => {
    const viewport = { width: 1400, height: 560 };
    const fitted = fitView(stage, viewport);
    const free = {
      width: viewport.width - CHROME_INSETS.left - CHROME_INSETS.right,
      height: viewport.height - CHROME_INSETS.top - CHROME_INSETS.bottom,
    };

    expect(fitted.zoom).toBeCloseTo(Math.min(free.width / stage.width, free.height / stage.height), 6);
    expect(stage.height * fitted.zoom).toBeLessThanOrEqual(free.height + 1e-6);
  });

  it("offsets the centre so the image sits in the free area", () => {
    const fitted = fitView(stage, { width: 1400, height: 560 });
    // The rail on the left is wider than the margin on the right, so the image
    // shifts right; the inspector at the bottom pushes it up.
    expect(fitted.pan.x).toBeCloseTo((CHROME_INSETS.left - CHROME_INSETS.right) / 2);
    expect(fitted.pan.y).toBeCloseTo((CHROME_INSETS.top - CHROME_INSETS.bottom) / 2);
    expect(fitted.pan.y).toBeLessThan(0);
  });

  it("keeps the whole stage inside the viewport, chrome included", () => {
    const viewport = { width: 900, height: 700 };
    const fitted = fitView(stage, viewport);
    expect(stage.width * fitted.zoom).toBeLessThanOrEqual(viewport.width);
    expect(stage.height * fitted.zoom).toBeLessThanOrEqual(viewport.height);
  });

  it("drops the insets on a host too small to spare them", () => {
    const viewport = { width: 200, height: 180 };
    const fitted = fitView(stage, viewport);
    expect(fitted.pan).toEqual({ x: 0, y: 0 });
    expect(fitted.zoom).toBeCloseTo(Math.min(200 / stage.width, 180 / stage.height), 6);
  });

  it("switches behaviour exactly at the minimum free size", () => {
    const width = MIN_FREE_SIZE + CHROME_INSETS.left + CHROME_INSETS.right;
    const height = MIN_FREE_SIZE + CHROME_INSETS.top + CHROME_INSETS.bottom;
    // Explicit insets: at this size the automatic choice would be the compact set.
    expect(fitView(stage, { width, height }, CHROME_INSETS).pan.x).not.toBe(0);
    expect(fitView(stage, { width: width - 1, height }, CHROME_INSETS).pan).toEqual({ x: 0, y: 0 });
  });

  it("respects custom insets", () => {
    const fitted = fitView(stage, { width: 1000, height: 1000 }, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(fitted.pan).toEqual({ x: 0, y: 0 });
    expect(fitted.zoom).toBeCloseTo(1000 / stage.width, 6);
  });

  it("never returns a zoom outside the limits", () => {
    const huge = fitView({ width: 10, height: 10 }, { width: 4000, height: 4000 });
    expect(huge.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    const tiny = fitView({ width: 100000, height: 100000 }, { width: 300, height: 300 });
    expect(tiny.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });
});

describe("insetsFromChrome", () => {
  const host = { left: 0, top: 0, right: 1000, bottom: 600 };

  it("charges a bottom-docked panel to the bottom", () => {
    const inspector = { left: 200, top: 520, right: 800, bottom: 580 };
    const insets = insetsFromChrome(host, [inspector], 10);
    expect(insets.bottom).toBe(90);
    expect(insets.top).toBe(0);
    expect(insets.left).toBe(0);
  });

  it("reserves more as a panel wraps onto more rows", () => {
    const oneRow = insetsFromChrome(host, [{ left: 200, top: 520, right: 800, bottom: 580 }], 10);
    const threeRows = insetsFromChrome(host, [{ left: 200, top: 400, right: 800, bottom: 580 }], 10);
    expect(threeRows.bottom).toBeGreaterThan(oneRow.bottom);
  });

  it("charges a left rail to the left and a top cluster to the top", () => {
    const rail = { left: 10, top: 200, right: 60, bottom: 400 };
    const actions = { left: 700, top: 12, right: 980, bottom: 60 };
    const insets = insetsFromChrome(host, [rail, actions], 10);
    expect(insets.left).toBe(70);
    expect(insets.top).toBe(70);
  });

  it("docks a bar along its long axis, not to whichever edge is nearest", () => {
    // A full-width action bar tucked into the top-right corner is as close to
    // the right edge as to the top; charging it to the right would reserve a
    // third of the host's width for something an inch tall.
    const actions = { left: 700, top: 12, right: 988, bottom: 60 };
    const insets = insetsFromChrome(host, [actions], 10);
    expect(insets.top).toBe(70);
    expect(insets.right).toBe(0);
  });

  it("keeps the deepest intrusion when two pieces share an edge", () => {
    const shallow = { left: 0, top: 540, right: 300, bottom: 580 };
    const deep = { left: 400, top: 460, right: 900, bottom: 580 };
    expect(insetsFromChrome(host, [shallow, deep], 0).bottom).toBe(140);
  });

  it("puts a bar floating in the lower middle with the panel below it", () => {
    // The compact layout lays the tool rail down just above the inspector. It is
    // marginally closer to the top, but charging it there costs the whole middle
    // of the host; charged to the bottom it shares the inspector's depth.
    const rail = { left: 12, top: 278, right: 988, bottom: 328 };
    const inspector = { left: 8, top: 336, right: 992, bottom: 592 };
    const insets = insetsFromChrome(host, [rail, inspector], 10);
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(host.bottom - rail.top + 10);
  });

  it("ignores chrome that is not showing", () => {
    const hidden = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(insetsFromChrome(host, [hidden, null, undefined])).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });
});

/**
 * The compact layout is decided twice — once in CSS, which lays the chrome out,
 * and once in `insetsFor`, which fits the picture into what the chrome leaves.
 * They have to agree on where "compact" begins.
 *
 * They used to agree by hand, under a comment in each file asking the other to
 * keep up. `responsive.ts` records that its two copies of the compact *rules*
 * had already drifted apart once — one carried a stray duplicate block, and a
 * class name was spelled differently in each — so the same hazard sitting in
 * three numbers was a matter of time. The stylesheet interpolates them now, and
 * this is the test that says so.
 */
describe("the compact breakpoints", () => {
  it("are the numbers the stylesheet actually emits", () => {
    // Moving a constant now moves the CSS with it — which is why this passes
    // under a changed breakpoint and fails the moment one is written out by
    // hand again. That is the coupling, stated as a test rather than a comment.
    expect(responsive).toContain(`@container (max-width: ${COMPACT_MAX_WIDTH}px)`);
    expect(responsive).toContain(`(max-height: ${COMPACT_MAX_HEIGHT}px)`);
    expect(responsive).toContain(`@media (max-width: ${COMPACT_FALLBACK_MAX_WIDTH}px)`);
  });

  it("agree with the size at which the insets change", () => {
    // One pixel either side of the boundary the CSS uses.
    expect(isCompactViewport({ width: COMPACT_MAX_WIDTH, height: 900 })).toBe(true);
    expect(isCompactViewport({ width: COMPACT_MAX_WIDTH + 1, height: 900 })).toBe(false);
    expect(isCompactViewport({ width: 1200, height: COMPACT_MAX_HEIGHT })).toBe(true);
    expect(isCompactViewport({ width: 1200, height: COMPACT_MAX_HEIGHT + 1 })).toBe(false);
  });

  it("errs towards compact on the viewport fallback, which cannot see the editor's box", () => {
    // A container query knows how much room the editor has; a media query only
    // knows the window, so it is set wider and dresses down sooner.
    expect(COMPACT_FALLBACK_MAX_WIDTH).toBeGreaterThan(COMPACT_MAX_WIDTH);
  });
});

/**
 * Zooming about a point.
 *
 * The point under the cursor has to stay under the cursor: scaling about the
 * middle of the canvas instead makes the picture slide away from the finger,
 * which reads as the editor fighting you. It was arithmetic inside a method
 * and could only be checked by opening a browser and trying it.
 */
describe("zoomAt", () => {
  const stage = { width: 1000, height: 500 };
  const viewport = { width: 800, height: 600 };
  const start = { zoom: 1, pan: { x: 0, y: 0 } };

  /** Where a stage point lands on screen, for the view given. */
  const onScreen = (view: ViewFit, point: { x: number; y: number }) =>
    applyToPoint(stageToView(stage, viewport, view.zoom, view.pan), point);

  it("keeps the anchored point under the pointer", () => {
    const anchor = { x: 200, y: 150 };
    const before = applyToPoint(invert(stageToView(stage, viewport, start.zoom, start.pan)), anchor);

    const zoomed = zoomAt(stage, viewport, start, 2, anchor);
    const after = onScreen(zoomed, before);

    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });

  it("holds it through a zoom out as well as a zoom in", () => {
    const anchor = { x: 700, y: 100 };
    const before = applyToPoint(invert(stageToView(stage, viewport, start.zoom, start.pan)), anchor);

    const zoomed = zoomAt(stage, viewport, start, 0.5, anchor);
    const after = onScreen(zoomed, before);

    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });

  it("scales about the middle when nothing is anchored", () => {
    // A button has no pointer to pin, so the picture stays centred.
    const zoomed = zoomAt(stage, viewport, start, 2);
    expect(zoomed.pan).toEqual(start.pan);
    expect(zoomed.zoom).toBe(2);
  });

  it("hands back the same view when the zoom would not move", () => {
    // Already at the ceiling: no pan change either, or a wheel at full zoom
    // would walk the picture across the canvas.
    const atLimit = zoomAt(stage, viewport, start, 1000, { x: 10, y: 10 });
    const again = zoomAt(stage, viewport, atLimit, 1000, { x: 10, y: 10 });
    expect(again).toBe(atLimit);
  });

  it("stays inside the zoom limits", () => {
    expect(zoomAt(stage, viewport, start, 1e6).zoom).toBeLessThan(1e6);
    expect(zoomAt(stage, viewport, start, 1e-6).zoom).toBeGreaterThan(0);
  });
});
