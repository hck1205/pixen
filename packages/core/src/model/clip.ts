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
 * How long a clip is allowed to be, as a host requires it.
 *
 * A floor and a ceiling on the *kept* length, not on what may be loaded: a
 * source longer than `max` opens as it always did, and it is the clip that is
 * held inside the limit. Somewhere to upload a thirty-second advert to is the
 * case this exists for.
 */
export interface ClipBounds {
  /** Shortest clip the host will accept, in seconds. */
  min?: number;
  /** Longest clip the host will accept, in seconds. */
  max?: number;
}

/**
 * The floor and ceiling that actually apply, once the source has had its say.
 *
 * A ten-second minimum against a three-second source cannot be met, and the
 * honest answer is the whole source rather than a range that runs off the end —
 * so the floor is brought inside the duration before anything is measured
 * against it, and the ceiling is never below the floor.
 */
export function clipLimits(duration: number, bounds: ClipBounds = {}): { limit: number; floor: number; ceiling: number } {
  const limit = Math.max(MIN_CLIP_SECONDS, duration);
  const floor = clamp(Math.max(MIN_CLIP_SECONDS, bounds.min ?? 0), MIN_CLIP_SECONDS, limit);
  const ceiling = clamp(bounds.max ?? Number.POSITIVE_INFINITY, floor, limit);
  return { limit, floor, ceiling };
}

/**
 * A range brought inside a source, in a fixed order: both ends into the source,
 * then swapped if they arrived the wrong way round, then pushed apart if they
 * are too close together, then pulled in if they are too far apart.
 *
 * Dragging the left handle past the right one is a gesture people make, and the
 * result they mean is an inverted selection rather than an error — so it is
 * sorted rather than refused.
 *
 * The start is what a ceiling holds: a clip that is too long loses time off its
 * end, because the end is the part a length limit is about. A drag knows better
 * than that and says so — see `dragHandle`, which stops the handle that moved.
 */
export function clampClip(range: ClipRange, duration: number, bounds: ClipBounds = {}): ClipRange {
  const { limit, floor, ceiling } = clipLimits(duration, bounds);
  const first = clamp(Math.min(range.start, range.end), 0, limit);
  const second = clamp(Math.max(range.start, range.end), 0, limit);
  const length = second - first;

  if (length > ceiling) return { start: first, end: first + ceiling };
  if (length >= floor) return { start: first, end: second };

  // Too short. Grow towards the end, and only backwards from the start when
  // there is no room left ahead — which is the end of the source.
  if (first + floor <= limit) return { start: first, end: first + floor };
  return { start: limit - floor, end: limit };
}

/** How long the kept part runs for. */
export function clipDuration(range: ClipRange): number {
  return range.end - range.start;
}

/**
 * The kept parts of a source, in order and never overlapping.
 *
 * One range was the whole of trimming until it was not: a talk with two good
 * answers in it, an interview with the pauses taken out, a reel of three
 * moments. What is stored is what is *kept*, not what is removed, because the
 * kept parts are what the exported file is made of and what a strip draws.
 *
 * The invariant — sorted, non-overlapping, each range legal on its own — is
 * held by `clampSelection` rather than by the type, so a selection read off a
 * timeline or out of a saved document goes through the same door.
 */
export type ClipSelection = readonly ClipRange[];

/** How long everything kept runs for, which is the exported file's length. */
export function selectionDuration(selection: ClipSelection): number {
  return selection.reduce((total, range) => total + clipDuration(range), 0);
}

/**
 * A selection brought inside a source: each range clamped, then sorted, then
 * merged where they touch or overlap.
 *
 * Merging rather than refusing, because two ranges that overlap describe one
 * kept stretch and that is what the export would write anyway. Dragging one
 * segment's edge into its neighbour is a gesture people make; the result they
 * mean is one longer segment.
 *
 * `bounds.max` is a ceiling on the *total* — a host asking for thirty seconds
 * means thirty seconds of film, however many pieces it arrives in — so ranges
 * are kept in order until the budget runs out, and the one that crosses it is
 * cut short rather than dropped.
 */
export function clampSelection(selection: ClipSelection, duration: number, bounds: ClipBounds = {}): ClipSelection {
  const { limit, floor, ceiling } = clipLimits(duration, bounds);
  const clamped = selection
    .map((range) => clampClip(range, limit))
    .sort((a, b) => a.start - b.start);

  const merged: ClipRange[] = [];
  for (const range of clamped) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      if (range.end > last.end) merged[merged.length - 1] = { start: last.start, end: range.end };
      continue;
    }
    merged.push({ ...range });
  }

  if (merged.length === 0) return [clampClip(wholeClip(limit), limit, bounds)];

  const kept: ClipRange[] = [];
  let spent = 0;
  for (const range of merged) {
    const room = ceiling - spent;
    if (room < floor) break;
    const length = Math.min(clipDuration(range), room);
    kept.push({ start: range.start, end: range.start + length });
    spent += length;
  }
  return kept;
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
export function clipFromFractions(start: number, end: number, duration: number, bounds: ClipBounds = {}): ClipRange {
  const limit = Math.max(MIN_CLIP_SECONDS, duration);
  return clampClip({ start: start * limit, end: end * limit }, limit, bounds);
}

/**
 * What is left of a selection once a stretch of it is taken out.
 *
 * The gesture that makes several kept parts out of one: mark the pause, the
 * stumble, the dead air, and remove it. A part the cut falls inside becomes two
 * parts; a part it covers entirely goes; a part it clips loses an end.
 *
 * Removing everything leaves the selection alone rather than nothing. A clip
 * has to be *something* — an empty selection is not a shorter film, it is no
 * film — and the honest answer to "cut all of it" is that there is nothing left
 * to cut, which the caller can see because what came back is what went in.
 */
export function subtractRange(
  selection: ClipSelection,
  cut: ClipRange,
  duration: number,
  bounds: ClipBounds = {},
): ClipSelection {
  const { limit } = clipLimits(duration, bounds);
  const from = clamp(Math.min(cut.start, cut.end), 0, limit);
  const to = clamp(Math.max(cut.start, cut.end), 0, limit);

  const kept: ClipRange[] = [];
  for (const part of clampSelection(selection, duration, bounds)) {
    if (to <= part.start || from >= part.end) {
      kept.push({ ...part });
      continue;
    }
    if (from - part.start >= MIN_CLIP_SECONDS) kept.push({ start: part.start, end: from });
    if (part.end - to >= MIN_CLIP_SECONDS) kept.push({ start: to, end: part.end });
  }

  if (kept.length === 0) return clampSelection(selection, duration, bounds);
  return clampSelection(kept, duration, bounds);
}
