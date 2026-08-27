/**
 * Where the two handles sit, and what a drag on one of them means.
 *
 * The decision, kept away from the DOM that shows it: a strip is a pair of
 * fractions across a fixed width, and the conversion between those and the
 * seconds a document stores is core's, not this package's. What is here is only
 * what a *handle* adds — that one end may not be dragged through the other, and
 * that the numbers a reader sees are the clip's rather than the source's.
 */
import { clipFractions, clipFromFractions, clipLimits, type ClipBounds, type ClipRange } from "@pixen/core";

export interface TrackLayout {
  /** Left edge of the kept region, as a percentage of the strip. */
  left: number;
  /** Width of the kept region, as a percentage of the strip. */
  width: number;
}

export function trackLayout(clip: ClipRange, duration: number): TrackLayout {
  const { start, end } = clipFractions(clip, duration);
  return { left: start * 100, width: Math.max(0, end - start) * 100 };
}

export type Handle = "start" | "end";

/**
 * The clip a handle drag produces.
 *
 * The handle that did *not* move is held: dragging the start past the end
 * should stop at the end rather than swap the two, which is what `clampClip`
 * would do with an inverted range and is the right answer for a *typed* range
 * and the wrong one for a dragged handle. The pointer is already past it, so
 * swapping would make the picture jump out from under the finger.
 *
 * A length bound is held the same way, and for the same reason. `clampClip`
 * takes time off the end because it has no idea which end anyone touched; here
 * we do, so the handle being dragged is the one that stops. A start handle that
 * quietly dragged the far end along with it would be moving a part of the clip
 * nobody had hold of.
 */
export function dragHandle(
  clip: ClipRange,
  duration: number,
  handle: Handle,
  fraction: number,
  bounds: ClipBounds = {},
): ClipRange {
  const { limit, floor, ceiling } = clipLimits(duration, bounds);
  const seconds = Math.max(0, Math.min(1, fraction)) * limit;

  if (handle === "start") {
    // Never through the other handle, never closer than the floor, and never
    // further away than the ceiling allows.
    const start = Math.min(Math.max(seconds, clip.end - ceiling), clip.end - floor);
    return clipFromFractions(start / limit, clip.end / limit, limit, bounds);
  }
  const end = Math.max(Math.min(seconds, clip.start + ceiling), clip.start + floor);
  return clipFromFractions(clip.start / limit, end / limit, limit, bounds);
}

/** "1.0s – 2.0s of 3.0s", the numbers a person checks a trim against. */
export function trackReadout(clip: ClipRange, duration: number): string {
  return `${clip.start.toFixed(1)}s – ${clip.end.toFixed(1)}s / ${duration.toFixed(1)}s`;
}
