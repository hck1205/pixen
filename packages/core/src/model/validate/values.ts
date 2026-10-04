import { isErr } from "../../fp/result.js";
import type { Point, Rect } from "../../geometry/types.js";
import { ADJUSTMENT_RANGES } from "../adjustments.js";
import { COLOUR_MATRIX_LENGTH } from "../../render/colour-matrix.js";
import { MIN_CLIP_SECONDS, type ClipRange, type ClipSelection } from "../clip.js";
import { DEFAULT_FRAME } from "../defaults.js";
import { ADJUSTMENT_KEYS, FRAME_STYLES, type AdjustmentKey, type FrameSettings, type Stroke } from "../types.js";
import {
  arrayOf,
  field,
  finiteNumber,
  issue,
  literalUnion,
  object,
  optional,
  text,
  withDefault,
  type FieldReader,
  type Validator,
} from "./combinators.js";
import { err } from "../../fp/result.js";

/**
 * The values a document is made of, before anything is a document.
 *
 * A point, a rect, a range of time, a stroke, a frame — each checked on its own
 * terms, and each the same whichever field it turns up in. Kept apart from the
 * document and the layers so "what is a legal clip" is a question with one
 * place to look rather than a paragraph inside a bigger table.
 */
/**
 * What a Pixen document looks like, as a declaration.
 *
 * Every optional field is normalised rather than rejected, so a document
 * written by an older build still loads — the migrations handle the shape
 * changes, and this handles the fields that were simply not there yet.
 */

// --- geometry --------------------------------------------------------------

export const point: Validator<Point> = object<Point>({
  x: field("x", finiteNumber),
  y: field("y", finiteNumber),
});

const rectShape = object<Rect>({
  x: field("x", finiteNumber),
  y: field("y", finiteNumber),
  width: field("width", finiteNumber),
  height: field("height", finiteNumber),
});

/** A rect with a negative side is not a rect, whatever its fields parse as. */
export const rect: Validator<Rect> = (value, path) => {
  const parsed = rectShape(value, path);
  if (isErr(parsed)) return parsed;
  if (parsed.value.width < 0 || parsed.value.height < 0) {
    return err(issue(path, "a rect with non-negative size", value));
  }
  return parsed;
};

const clipShape = object<ClipRange>({
  start: field("start", finiteNumber),
  end: field("end", finiteNumber),
});

/**
 * A clip that runs backwards, or for no time at all, is not a clip.
 *
 * Rejected rather than sorted: `clampClip` sorts a *gesture*, where dragging one
 * handle past the other is a thing people mean. A stored document that arrived
 * inverted did not come from a gesture, and quietly repairing it would hide
 * whatever wrote it.
 */
const clipRange: Validator<ClipRange> = (value, path) => {
  const parsed = clipShape(value, path);
  if (isErr(parsed)) return parsed;
  const { start, end } = parsed.value;
  if (start < 0 || end - start < MIN_CLIP_SECONDS) {
    return err(issue(path, `a clip starting at or after 0 and lasting at least ${MIN_CLIP_SECONDS}s`, value));
  }
  return parsed;
};

/**
 * The kept parts, as stored: at least one, each legal, in order and apart.
 *
 * Checked rather than repaired, for the same reason a single range is. A
 * gesture goes through `clampSelection`, which sorts and merges because that is
 * what a drag means; a stored document that arrived out of order did not come
 * from a drag, and quietly fixing it would hide whatever wrote it.
 */
export const clipSelection: Validator<ClipSelection> = (value, path) => {
  const parsed = arrayOf(clipRange)(value, path);
  if (isErr(parsed)) return parsed;
  const ranges = parsed.value;
  if (ranges.length === 0) return err(issue(path, "at least one kept range", value));
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i]!.start < ranges[i - 1]!.end) {
      return err(issue(path, "kept ranges in order and not overlapping", value));
    }
  }
  return parsed;
};

export const stroke: Validator<Stroke> = object<Stroke>({
  color: field("color", text),
  width: field("width", finiteNumber),
  dash: field("dash", optional(arrayOf(finiteNumber))),
});

/**
 * One validator per adjustment, built from the list rather than written out, so
 * an adjustment added to the vocabulary is validated without a second edit.
 * Missing values default to neutral: an older document simply had fewer.
 */
export const adjustmentFields = Object.fromEntries(
  ADJUSTMENT_KEYS.map((key) => [key, field(key, withDefault(finiteNumber, ADJUSTMENT_RANGES[key].neutral))]),
) as { [K in AdjustmentKey]: FieldReader<number> };

export const frameSettings: Validator<FrameSettings> = object<FrameSettings>({
  style: field("style", withDefault(literalUnion(...FRAME_STYLES), DEFAULT_FRAME.style)),
  width: field("width", withDefault(finiteNumber, DEFAULT_FRAME.width)),
  colour: field("colour", withDefault(text, DEFAULT_FRAME.colour)),
  radius: field("radius", withDefault(finiteNumber, DEFAULT_FRAME.radius)),
  inset: field("inset", withDefault(finiteNumber, DEFAULT_FRAME.inset)),
  offset: field("offset", withDefault(finiteNumber, DEFAULT_FRAME.offset)),
  count: field("count", withDefault(finiteNumber, DEFAULT_FRAME.count)),
  armLength: field("armLength", withDefault(finiteNumber, DEFAULT_FRAME.armLength)),
});

// --- layers ----------------------------------------------------------------

/**
 * A stored colour matrix: twenty finite numbers, and nothing else.
 *
 * Checked rather than repaired, like every other stored value. A matrix of
 * nineteen is not a matrix that is nearly right — it is a file written by
 * something that did not know the shape, and padding it would hide that.
 */
export const colourMatrix: Validator<readonly number[]> = (value, path) => {
  const parsed = arrayOf(finiteNumber)(value, path);
  if (isErr(parsed)) return parsed;
  if (parsed.value.length !== COLOUR_MATRIX_LENGTH) {
    return err(issue(path, `a colour matrix of ${COLOUR_MATRIX_LENGTH} numbers`, value));
  }
  return parsed;
};
