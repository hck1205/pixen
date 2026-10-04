import { isErr } from "../../fp/result.js";
import { REDACTION_COLOUR } from "../palette.js";
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_LAYER_LOCKED,
  DEFAULT_LAYER_OPACITY,
  DEFAULT_LAYER_ROTATION,
  DEFAULT_LAYER_SPACE,
  DEFAULT_RETOUCH_FEATHER,
  DEFAULT_LAYER_VISIBLE,
  DEFAULT_REDACTION_MODE,
  DEFAULT_REDACTION_STRENGTH,
  DEFAULT_STROKE,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_COLOUR,
} from "../defaults.js";
import { LAYER_SPACES, LINE_ENDS, REDACTION_MODES, type EditorLayer, type LayerType } from "../types.js";
import {
  arrayOf,
  boolean,
  constant,
  field,
  finiteNumber,
  issue,
  literalUnion,
  nullable,
  optional,
  record,
  shape,
  text,
  withDefault,
  type Fields,
  type Validator,
} from "./combinators.js";
import { err } from "../../fp/result.js";
import { point, rect, stroke } from "./values.js";

/**
 * What each kind of annotation stores.
 *
 * A table rather than a validator per kind: every layer shares the same handful
 * of fields and differs in a line or two, so a table is the shape that makes
 * "what does an arrow store" something to look up rather than to read.
 */
/** What every layer carries, whatever kind it is. */
const layerBase = {
  space: field("space", withDefault(literalUnion(...LAYER_SPACES), DEFAULT_LAYER_SPACE)),
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
    startStyle: field("startStyle", withDefault(literalUnion(...LINE_ENDS), "none")),
    endStyle: field("endStyle", withDefault(literalUnion(...LINE_ENDS), "none")),
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
  retouch: {
    ...layerBase,
    type: constant("retouch"),
    frame: field("frame", rect),
    feather: field("feather", withDefault(finiteNumber, DEFAULT_RETOUCH_FEATHER)),
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
