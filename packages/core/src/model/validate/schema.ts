import { PixenError } from "../../errors/index.js";
import { err, isErr, ok, type Result } from "../../fp/result.js";
import type { Point, Rect } from "../../geometry/types.js";
import { ADJUSTMENT_RANGES } from "../adjustments.js";
import { MIN_CLIP_SECONDS, type ClipRange } from "../clip.js";
import { REDACTION_COLOUR } from "../palette.js";
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_FRAME,
  DEFAULT_REDACTION_MODE,
  DEFAULT_REDACTION_STRENGTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_LAYER_LOCKED,
  DEFAULT_LAYER_OPACITY,
  DEFAULT_LAYER_ROTATION,
  DEFAULT_LAYER_VISIBLE,
  DEFAULT_QUALITY,
  DEFAULT_STROKE,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_COLOUR,
} from "../defaults.js";
import {
  ADJUSTMENT_KEYS,
  FRAME_STYLES,
  IMAGE_FORMATS,
  REDACTION_MODES,
  type AdjustmentKey,
  type EditorDocument,
  type EditorLayer,
  type FrameSettings,
  type ImageFormat,
  type LayerType,
  type Stroke,
} from "../types.js";
import {
  arrayOf,
  boolean,
  constant,
  field,
  finiteNumber,
  formatIssues,
  group,
  issue,
  literalUnion,
  nullable,
  object,
  optional,
  record,
  recordOrEmpty,
  shape,
  text,
  withDefault,
  type FieldReader,
  type Fields,
  type ValidationIssue,
  type Validator,
} from "./combinators.js";

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
const adjustmentFields = Object.fromEntries(
  ADJUSTMENT_KEYS.map((key) => [key, field(key, withDefault(finiteNumber, ADJUSTMENT_RANGES[key].neutral))]),
) as { [K in AdjustmentKey]: FieldReader<number> };

export const frameSettings: Validator<FrameSettings> = object<FrameSettings>({
  style: field("style", withDefault(literalUnion(...FRAME_STYLES), DEFAULT_FRAME.style)),
  width: field("width", withDefault(finiteNumber, DEFAULT_FRAME.width)),
  colour: field("colour", withDefault(text, DEFAULT_FRAME.colour)),
  radius: field("radius", withDefault(finiteNumber, DEFAULT_FRAME.radius)),
  inset: field("inset", withDefault(finiteNumber, DEFAULT_FRAME.inset)),
});

// --- layers ----------------------------------------------------------------

/** What every layer carries, whatever kind it is. */
const layerBase = {
  id: field("id", text),
  name: field("name", optional(text)),
  visible: field("visible", withDefault(boolean, DEFAULT_LAYER_VISIBLE)),
  locked: field("locked", withDefault(boolean, DEFAULT_LAYER_LOCKED)),
  opacity: field("opacity", withDefault(finiteNumber, DEFAULT_LAYER_OPACITY)),
  rotation: field("rotation", withDefault(finiteNumber, DEFAULT_LAYER_ROTATION)),
};

/**
 * What each kind of layer carries on top of that — a table rather than a
 * switch, so the list of kinds Pixen accepts is a thing that can be read, and
 * the error message naming them cannot drift from it.
 */
const LAYER_FIELDS: { [K in LayerType]: Fields<Extract<EditorLayer, { type: K }>> } = {
  rect: {
    ...layerBase,
    type: constant("rect"),
    frame: field("frame", rect),
    stroke: field("stroke", nullable(stroke)),
    fill: field("fill", nullable(text)),
    cornerRadius: field("cornerRadius", withDefault(finiteNumber, DEFAULT_CORNER_RADIUS)),
  },
  ellipse: {
    ...layerBase,
    type: constant("ellipse"),
    frame: field("frame", rect),
    stroke: field("stroke", nullable(stroke)),
    fill: field("fill", nullable(text)),
  },
  line: {
    ...layerBase,
    type: constant("line"),
    from: field("from", point),
    to: field("to", point),
    stroke: field("stroke", withDefault(stroke, { ...DEFAULT_STROKE })),
    arrowStart: field("arrowStart", withDefault(boolean, false)),
    arrowEnd: field("arrowEnd", withDefault(boolean, false)),
  },
  path: {
    ...layerBase,
    type: constant("path"),
    points: field("points", arrayOf(point)),
    stroke: field("stroke", withDefault(stroke, { ...DEFAULT_STROKE })),
    closed: field("closed", withDefault(boolean, false)),
  },
  image: {
    ...layerBase,
    type: constant("image"),
    resourceId: field("resourceId", text),
    frame: field("frame", rect),
    repeat: field("repeat", withDefault(boolean, false)),
  },
  redact: {
    ...layerBase,
    type: constant("redact"),
    frame: field("frame", rect),
    mode: field("mode", withDefault(literalUnion(...REDACTION_MODES), DEFAULT_REDACTION_MODE)),
    strength: field("strength", withDefault(finiteNumber, DEFAULT_REDACTION_STRENGTH)),
    colour: field("colour", withDefault(text, REDACTION_COLOUR)),
  },
  text: {
    ...layerBase,
    type: constant("text"),
    position: field("position", point),
    text: field("text", text),
    fontSize: field("fontSize", withDefault(finiteNumber, DEFAULT_FONT_SIZE)),
    fontFamily: field("fontFamily", withDefault(text, DEFAULT_FONT_FAMILY)),
    color: field("color", withDefault(text, DEFAULT_TEXT_COLOUR)),
    align: field("align", withDefault(literalUnion("left", "center", "right"), DEFAULT_TEXT_ALIGN)),
    backgroundColor: field("backgroundColor", nullable(text)),
    maxWidth: field("maxWidth", nullable(finiteNumber)),
  },
};

const LAYER_TYPES = Object.keys(LAYER_FIELDS) as LayerType[];

export const layer: Validator<EditorLayer> = (value, path) => {
  const asRecord = record(value, path);
  if (isErr(asRecord)) return asRecord;

  const kind = asRecord.value.type;
  if (typeof kind !== "string" || !(kind in LAYER_FIELDS)) {
    return err(issue(`${path}.type`, `one of ${LAYER_TYPES.join(", ")}`, kind));
  }

  // The cast is the one thing the type system cannot follow: which entry of the
  // table applies is decided by a value, and the answer is a different shape
  // for each. It is checked where the table is written instead.
  const fields = LAYER_FIELDS[kind as LayerType] as unknown as Fields<EditorLayer>;
  return shape<EditorLayer>(asRecord.value, path, fields);
};

// --- document --------------------------------------------------------------

const imageFormat = literalUnion<ImageFormat>(...IMAGE_FORMATS);

/**
 * Structural validation for documents crossing a trust boundary — host storage,
 * a server, a pasted string.
 */
export function validateDocument(value: unknown): Result<EditorDocument, ValidationIssue[]> {
  return object<EditorDocument>({
    schemaVersion: field("schemaVersion", finiteNumber),
    source: field(
      "source",
      object<EditorDocument["source"]>({
        resourceId: field("resourceId", text),
        width: field("width", finiteNumber),
        height: field("height", finiteNumber),
        name: field("name", optional(text)),
        mimeType: field("mimeType", optional(text)),
        duration: field("duration", optional(finiteNumber)),
      }),
    ),
    transform: group("transform", {
      rotation: field("rotation", withDefault(finiteNumber, 0)),
      flipX: field("flipX", withDefault(boolean, false)),
      flipY: field("flipY", withDefault(boolean, false)),
    }),
    crop: field("crop", nullable(rect)),
    clip: field("clip", withDefault(nullable(clipRange), null)),
    aspectRatio: field("aspectRatio", nullable(finiteNumber)),
    adjustments: group("adjustments", adjustmentFields),
    frame: field("frame", nullable(frameSettings)),
    layers: field("layers", withDefault(arrayOf(layer), [])),
    output: group("output", {
      width: field("width", nullable(finiteNumber)),
      height: field("height", nullable(finiteNumber)),
      format: field("format", nullable(imageFormat)),
      quality: field("quality", withDefault(finiteNumber, DEFAULT_QUALITY)),
      background: field("background", nullable(text)),
    }),
    // Host-owned, so it is carried rather than checked.
    meta: (source) => ok(recordOrEmpty(source.meta)),
  })(value, "$");
}

/** The throwing boundary. Every issue found travels with the error. */
export function parseDocument(value: unknown): EditorDocument {
  const result = validateDocument(value);
  if (result.ok) return result.value;
  throw new PixenError("INVALID_DOCUMENT", `Invalid document at ${formatIssues(result.error)}`, {
    details: { issues: result.error },
  });
}
