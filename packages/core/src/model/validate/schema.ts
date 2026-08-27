import { PixenError } from "../../errors/index.js";
import { ok, type Result } from "../../fp/result.js";
import { IMAGE_FORMATS, type EditorDocument, type ImageFormat } from "../types.js";
import {
  arrayOf,
  boolean,
  field,
  finiteNumber,
  formatIssues,
  group,
  literalUnion,
  nullable,
  object,
  optional,
  recordOrEmpty,
  text,
  withDefault,
  type ValidationIssue,
} from "./combinators.js";
import { layer } from "./layers.js";
import { adjustmentFields, clipSelection, frameSettings, rect } from "./values.js";

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
    clip: field("clip", withDefault(nullable(clipSelection), null)),
    aspectRatio: field("aspectRatio", nullable(finiteNumber)),
    adjustments: group("adjustments", adjustmentFields),
    frame: field("frame", nullable(frameSettings)),
    layers: field("layers", withDefault(arrayOf(layer), [])),
    output: group("output", {
      width: field("width", nullable(finiteNumber)),
      height: field("height", nullable(finiteNumber)),
      format: field("format", nullable(imageFormat)),
      quality: field("quality", withDefault(nullable(finiteNumber), null)),
      background: field("background", nullable(text)),
      upscale: field("upscale", withDefault(boolean, false)),
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
