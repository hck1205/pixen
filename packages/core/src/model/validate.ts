import { PixenError } from "../errors/index.js";
import { collectAll, err, isErr, ok, type Result } from "../fp/result.js";
import type { Point, Rect } from "../geometry/types.js";
import { ADJUSTMENT_RANGES } from "./adjustments.js";
import { REDACTION_COLOUR } from "./palette.js";
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
} from "./defaults.js";
import {
  ADJUSTMENT_KEYS,
  FRAME_STYLES,
  REDACTION_MODES,
  type AdjustmentKey,
  type EditorDocument,
  type EditorLayer,
  type FrameSettings,
  type ImageFormat,
  type Stroke,
} from "./types.js";

export interface ValidationIssue {
  /** JSON path into the document, e.g. `$.layers[2].frame.width`. */
  path: string;
  expected: string;
  received: unknown;
}

/**
 * A validator is a pure function from unknown data to a result carrying **every**
 * problem it found, not just the first. Composing them this way means a host
 * with three broken fields learns about three broken fields.
 */
export type Validator<T> = (value: unknown, path: string) => Result<T, ValidationIssue[]>;

function issue(path: string, expected: string, received: unknown): ValidationIssue[] {
  return [{ path, expected, received }];
}

// --- primitives ------------------------------------------------------------

export const finiteNumber: Validator<number> = (value, path) =>
  typeof value === "number" && Number.isFinite(value)
    ? ok(value)
    : err(issue(path, "a finite number", value));

export const boolean: Validator<boolean> = (value, path) =>
  typeof value === "boolean" ? ok(value) : err(issue(path, "a boolean", value));

export const text: Validator<string> = (value, path) =>
  typeof value === "string" ? ok(value) : err(issue(path, "a string", value));

export function literalUnion<T extends string>(...allowed: T[]): Validator<T> {
  return (value, path) =>
    typeof value === "string" && (allowed as string[]).includes(value)
      ? ok(value as T)
      : err(issue(path, `one of ${allowed.join(", ")}`, value));
}

/** Applies `validator` unless the value is absent, in which case `fallback` is used. */
export function withDefault<T>(validator: Validator<T>, fallback: T): Validator<T> {
  return (value, path) => (value === undefined || value === null ? ok(fallback) : validator(value, path));
}

/** Applies `validator` unless the value is absent, in which case the result is null. */
export function nullable<T>(validator: Validator<T>): Validator<T | null> {
  return (value, path) => (value === undefined || value === null ? ok(null) : validator(value, path));
}

export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value, path) => (value === undefined || value === null ? ok(undefined) : validator(value, path));
}

export function arrayOf<T>(validator: Validator<T>): Validator<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return err(issue(path, "an array", value));
    return collectAll(value.map((entry, index) => validator(entry, `${path}[${index}]`)));
  };
}

export function record(value: unknown, path: string): Result<Record<string, unknown>, ValidationIssue[]> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? ok(value as Record<string, unknown>)
    : err(issue(path, "an object", value));
}

/**
 * Validates several fields of one object, gathering the issues from all of them.
 * `fields` maps each output key to the reader that produces it.
 */
function shape<T extends object>(
  source: Record<string, unknown>,
  path: string,
  fields: { [K in keyof T]: (source: Record<string, unknown>, path: string) => Result<T[K], ValidationIssue[]> },
): Result<T, ValidationIssue[]> {
  const output = {} as T;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(fields) as Array<keyof T>) {
    const result = fields[key](source, path);
    if (result.ok) output[key] = result.value;
    else issues.push(...result.error);
  }

  return issues.length > 0 ? err(issues) : ok(output);
}

/** Reads one property with `validator`, extending the path for error reporting. */
function field<T>(key: string, validator: Validator<T>) {
  return (source: Record<string, unknown>, path: string): Result<T, ValidationIssue[]> =>
    validator(source[key], `${path}.${key}`);
}

// --- geometry --------------------------------------------------------------

export const point: Validator<Point> = (value, path) => {
  const asRecord = record(value, path);
  if (isErr(asRecord)) return asRecord;
  return shape<Point>(asRecord.value, path, { x: field("x", finiteNumber), y: field("y", finiteNumber) });
};

export const rect: Validator<Rect> = (value, path) => {
  const asRecord = record(value, path);
  if (isErr(asRecord)) return asRecord;
  const parsed = shape<Rect>(asRecord.value, path, {
    x: field("x", finiteNumber),
    y: field("y", finiteNumber),
    width: field("width", finiteNumber),
    height: field("height", finiteNumber),
  });
  if (isErr(parsed)) return parsed;
  if (parsed.value.width < 0 || parsed.value.height < 0) {
    return err(issue(path, "a rect with non-negative size", value));
  }
  return parsed;
};

export const stroke: Validator<Stroke> = (value, path) => {
  const asRecord = record(value, path);
  if (isErr(asRecord)) return asRecord;
  return shape<Stroke>(asRecord.value, path, {
    color: field("color", text),
    width: field("width", finiteNumber),
    dash: field("dash", optional(arrayOf(finiteNumber))) as never,
  });
};

/**
 * One validator per adjustment, built from the list rather than written out, so
 * an adjustment added to the vocabulary is validated without a second edit.
 * Missing values default to neutral: an older document simply had fewer.
 */
const adjustmentFields = Object.fromEntries(
  ADJUSTMENT_KEYS.map((key) => [key, field(key, withDefault(finiteNumber, ADJUSTMENT_RANGES[key].neutral))]),
) as {
  [K in AdjustmentKey]: (source: Record<string, unknown>, path: string) => Result<number, ValidationIssue[]>;
};

export const frameSettings: Validator<FrameSettings> = (value, path) => {
  const asRecord = record(value, path);
  if (isErr(asRecord)) return asRecord;
  return shape<FrameSettings>(asRecord.value, path, {
    style: field("style", withDefault(literalUnion(...FRAME_STYLES), DEFAULT_FRAME.style)),
    width: field("width", withDefault(finiteNumber, DEFAULT_FRAME.width)),
    colour: field("colour", withDefault(text, DEFAULT_FRAME.colour)),
    radius: field("radius", withDefault(finiteNumber, DEFAULT_FRAME.radius)),
    inset: field("inset", withDefault(finiteNumber, DEFAULT_FRAME.inset)),
  });
};

// --- layers ----------------------------------------------------------------

const layerBase = {
  id: field("id", text),
  name: field("name", optional(text)),
  visible: field("visible", withDefault(boolean, DEFAULT_LAYER_VISIBLE)),
  locked: field("locked", withDefault(boolean, DEFAULT_LAYER_LOCKED)),
  opacity: field("opacity", withDefault(finiteNumber, DEFAULT_LAYER_OPACITY)),
  rotation: field("rotation", withDefault(finiteNumber, DEFAULT_LAYER_ROTATION)),
};

export const layer: Validator<EditorLayer> = (value, path) => {
  const asRecord = record(value, path);
  if (isErr(asRecord)) return asRecord;
  const source = asRecord.value;

  switch (source.type) {
    case "rect":
      return shape<EditorLayer & { type: "rect" }>(source, path, {
        ...layerBase,
        type: () => ok("rect" as const),
        frame: field("frame", rect),
        stroke: field("stroke", nullable(stroke)),
        fill: field("fill", nullable(text)),
        cornerRadius: field("cornerRadius", withDefault(finiteNumber, DEFAULT_CORNER_RADIUS)),
      });
    case "ellipse":
      return shape<EditorLayer & { type: "ellipse" }>(source, path, {
        ...layerBase,
        type: () => ok("ellipse" as const),
        frame: field("frame", rect),
        stroke: field("stroke", nullable(stroke)),
        fill: field("fill", nullable(text)),
      });
    case "line":
      return shape<EditorLayer & { type: "line" }>(source, path, {
        ...layerBase,
        type: () => ok("line" as const),
        from: field("from", point),
        to: field("to", point),
        stroke: field("stroke", withDefault(stroke, { ...DEFAULT_STROKE })),
        arrowStart: field("arrowStart", withDefault(boolean, false)),
        arrowEnd: field("arrowEnd", withDefault(boolean, false)),
      });
    case "path":
      return shape<EditorLayer & { type: "path" }>(source, path, {
        ...layerBase,
        type: () => ok("path" as const),
        points: field("points", arrayOf(point)),
        stroke: field("stroke", withDefault(stroke, { ...DEFAULT_STROKE })),
        closed: field("closed", withDefault(boolean, false)),
      });
    case "image":
      return shape<EditorLayer & { type: "image" }>(source, path, {
        ...layerBase,
        type: () => ok("image" as const),
        resourceId: field("resourceId", text),
        frame: field("frame", rect),
        repeat: field("repeat", withDefault(boolean, false)),
      });
    case "redact":
      return shape<EditorLayer & { type: "redact" }>(source, path, {
        ...layerBase,
        type: () => ok("redact" as const),
        frame: field("frame", rect),
        mode: field("mode", withDefault(literalUnion(...REDACTION_MODES), DEFAULT_REDACTION_MODE)),
        strength: field("strength", withDefault(finiteNumber, DEFAULT_REDACTION_STRENGTH)),
        colour: field("colour", withDefault(text, REDACTION_COLOUR)),
      });
    case "text":
      return shape<EditorLayer & { type: "text" }>(source, path, {
        ...layerBase,
        type: () => ok("text" as const),
        position: field("position", point),
        text: field("text", text),
        fontSize: field("fontSize", withDefault(finiteNumber, DEFAULT_FONT_SIZE)),
        fontFamily: field("fontFamily", withDefault(text, DEFAULT_FONT_FAMILY)),
        color: field("color", withDefault(text, DEFAULT_TEXT_COLOUR)),
        align: field("align", withDefault(literalUnion("left", "center", "right"), DEFAULT_TEXT_ALIGN)),
        backgroundColor: field("backgroundColor", nullable(text)),
        maxWidth: field("maxWidth", nullable(finiteNumber)),
      });
    default:
      return err(issue(`${path}.type`, "one of rect, ellipse, line, path, text, image, redact", source.type));
  }
};

// --- document --------------------------------------------------------------

const imageFormat = literalUnion<ImageFormat>("image/jpeg", "image/png", "image/webp");

/**
 * Structural validation for documents crossing a trust boundary — host storage,
 * a server, a pasted string. Optional fields are normalised rather than
 * rejected, so a document written by an older build still loads.
 */
export function validateDocument(value: unknown): Result<EditorDocument, ValidationIssue[]> {
  const asRecord = record(value, "$");
  if (isErr(asRecord)) return asRecord;
  const source = asRecord.value;

  const nested = (key: string): Record<string, unknown> => {
    const child = source[key];
    return typeof child === "object" && child !== null && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  };

  return shape<EditorDocument>(source, "$", {
    schemaVersion: field("schemaVersion", finiteNumber),
    source: () => {
      const asSource = record(source.source, "$.source");
      if (isErr(asSource)) return asSource;
      return shape<EditorDocument["source"]>(asSource.value, "$.source", {
        resourceId: field("resourceId", text),
        width: field("width", finiteNumber),
        height: field("height", finiteNumber),
        name: field("name", optional(text)),
        mimeType: field("mimeType", optional(text)),
      });
    },
    transform: () =>
      shape<EditorDocument["transform"]>(nested("transform"), "$.transform", {
        rotation: field("rotation", withDefault(finiteNumber, 0)),
        flipX: field("flipX", withDefault(boolean, false)),
        flipY: field("flipY", withDefault(boolean, false)),
      }),
    crop: field("crop", nullable(rect)),
    aspectRatio: field("aspectRatio", nullable(finiteNumber)),
    adjustments: () =>
      shape<EditorDocument["adjustments"]>(nested("adjustments"), "$.adjustments", adjustmentFields),
    frame: field("frame", nullable(frameSettings)),
    layers: field("layers", withDefault(arrayOf(layer), [])),
    output: () =>
      shape<EditorDocument["output"]>(nested("output"), "$.output", {
        width: field("width", nullable(finiteNumber)),
        height: field("height", nullable(finiteNumber)),
        format: field("format", nullable(imageFormat)),
        quality: field("quality", withDefault(finiteNumber, DEFAULT_QUALITY)),
        background: field("background", nullable(text)),
      }),
    meta: () => ok(nested("meta")),
  });
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((entry) => `${entry.path}: expected ${entry.expected}`).join("; ");
}

/** The throwing boundary. Every issue found travels with the error. */
export function parseDocument(value: unknown): EditorDocument {
  const result = validateDocument(value);
  if (result.ok) return result.value;
  throw new PixenError("INVALID_DOCUMENT", `Invalid document at ${formatIssues(result.error)}`, {
    details: { issues: result.error },
  });
}
