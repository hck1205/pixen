/**
 * The part of a moving picture that is kept.
 *
 * A clip is to time what a crop is to space, and it is stored the same way: an
 * absolute range against a source that knows its own extent, rather than a pair
 * of fractions. Fractions look tidier in a settings object and are the wrong
 * thing to keep — `[0.5, 0.7]` of a source whose duration you have not got is
 * not a range, and the moment the picture underneath is replaced by one of a
 * different length it silently means something else. `crop` is in stage pixels
 * for exactly this reason, so `clip` is in seconds.
 *
 * Nothing here plays anything. Core knows what a clip is; `@pixen/video` knows
 * how to run one.
 */
import { clamp } from "../fp/function.js";

export interface ClipRange {
  /** Seconds from the beginning of the source. */
  start: number;
  /** Seconds from the beginning of the source; never below `start`. */
  end: number;
}

/**
 * The shortest clip that is still a clip.
 *
 * A zero-length range is not a picture, and the two handles of a timeline can be
 * dragged onto each other. One frame at sixty per second is a little under
 * seventeen milliseconds, so this is under any real frame and above zero.
 */
export const MIN_CLIP_SECONDS = 0.01;

/** The whole of a source, which is what "no clip" means. */
export function wholeClip(duration: number): ClipRange {
  return { start: 0, end: Math.max(MIN_CLIP_SECONDS, duration) };
}

/**
 * A range brought inside a source, in a fixed order: both ends into the source,
 * then swapped if they arrived the wrong way round, then pushed apart if they
 * are too close together.
 *
 * Dragging the left handle past the right one is a gesture people make, and the
 * result they mean is an inverted selection rather than an error — so it is
 * sorted rather than refused.
 */
export function clampClip(range: ClipRange, duration: number): ClipRange {
  const limit = Math.max(MIN_CLIP_SECONDS, duration);
  const first = clamp(Math.min(range.start, range.end), 0, limit);
  const second = clamp(Math.max(range.start, range.end), 0, limit);

  if (second - first >= MIN_CLIP_SECONDS) return { start: first, end: second };

  // Too short to be a clip. Grow towards the end, and only backwards from the
  // start when there is no room left ahead — which is the end of the source.
  if (first + MIN_CLIP_SECONDS <= limit) return { start: first, end: first + MIN_CLIP_SECONDS };
  return { start: limit - MIN_CLIP_SECONDS, end: limit };
}

/** How long the kept part runs for. */
export function clipDuration(range: ClipRange): number {
  return range.end - range.start;
}

/**
 * Where a moment inside the clip sits in the source.
 *
 * The clip's own timeline starts at zero, which is what an exported file's does;
 * this is the conversion between the two, and the one place that knows it.
 */
export function clipTimeToSource(range: ClipRange, seconds: number): number {
  return range.start + clamp(seconds, 0, clipDuration(range));
}

/**
 * The clip as a pair of fractions of the whole source, for a timeline that has
 * to lay two handles out across a fixed width.
 *
 * Presentation only. What is stored is seconds — see the note at the top.
 */
export function clipFractions(range: ClipRange, duration: number): { start: number; end: number } {
  const limit = Math.max(MIN_CLIP_SECONDS, duration);
  return { start: clamp(range.start / limit, 0, 1), end: clamp(range.end / limit, 0, 1) };
}

/** A range read back off a timeline, in fractions of the whole source. */
export function clipFromFractions(start: number, end: number, duration: number): ClipRange {
  const limit = Math.max(MIN_CLIP_SECONDS, duration);
  return clampClip({ start: start * limit, end: end * limit }, limit);
}
