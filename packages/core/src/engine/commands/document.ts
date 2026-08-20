/**
 * The document's own settings, and the two commands that touch all of it.
 *
 * Adjustments, the frame, the output settings: each is a shallow merge over
 * what is there, so a caller changes one field without restating the rest.
 * `replaceSource` and `resetEdits` are the exceptions — they rewrite the whole
 * document, and are here because there is nowhere narrower for them to be.
 */
import { PixenError } from "../../errors/index.js";
import { compose, scaling } from "../../geometry/matrix.js";
import { transformBounds } from "../../geometry/rect.js";
import { clampAdjustments } from "../../model/adjustments.js";
import { DEFAULT_FRAME, MAX_FRAME_WIDTH, MIN_FRAME_WIDTH } from "../../model/defaults.js";
import { clamp } from "../../fp/function.js";
import { layerBounds } from "../../model/layers.js";
import { scaleLayerToBounds } from "../../model/transform.js";
import { DEFAULT_ADJUSTMENTS } from "../../model/types.js";
import type {
  Adjustments,
  EditorDocument,
  FrameSettings,
  OutputSettings,
  SourceDescriptor,
} from "../../model/types.js";

/**
 * How far two scale factors may differ and still count as the same shape.
 *
 * Integer pixel sizes cannot express most ratios exactly — half of a 1601px
 * width is 800 or 801, never 800.5 — so an exact comparison would refuse
 * replacements that are right.
 */
const SOURCE_ASPECT_TOLERANCE = 0.005;

export function setAdjustments(document: EditorDocument, adjustments: Partial<Adjustments>): EditorDocument {
  // Clamped on the way in: a host value outside the range would otherwise reach
  // the filter string and the exported pixels.
  return { ...document, adjustments: clampAdjustments({ ...document.adjustments, ...adjustments }) };
}

/**
 * Sets or clears the frame.
 *
 * A partial patch turns one on with the defaults filled in, so a host that only
 * cares about the colour writes only the colour.
 */
export function setFrame(document: EditorDocument, frame: Partial<FrameSettings> | null): EditorDocument {
  if (frame === null) return { ...document, frame: null };
  const width = clamp(frame.width ?? document.frame?.width ?? DEFAULT_FRAME.width, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH);
  return { ...document, frame: { ...DEFAULT_FRAME, ...document.frame, ...frame, width } };
}

export function setOutput(document: EditorDocument, output: Partial<OutputSettings>): EditorDocument {
  return { ...document, output: { ...document.output, ...output } };
}

export function replaceSource(document: EditorDocument, source: SourceDescriptor): EditorDocument {
  const scaleX = source.width / document.source.width;
  const scaleY = source.height / document.source.height;

  if (Math.abs(scaleX - scaleY) > SOURCE_ASPECT_TOLERANCE) {
    throw new PixenError(
      "INVALID_IMAGE",
      "A replacement image must have the same aspect ratio as the one it replaces",
      { details: { from: document.source, to: source } },
    );
  }

  if (scaleX === 1 && scaleY === 1) return { ...document, source };

  // Through the matrix rather than by hand: a rescale is a transform, and the
  // one place that knows what transforming a rectangle means is `geometry`.
  const rescale = scaling(scaleX, scaleY);
  return {
    ...document,
    source,
    crop: document.crop ? transformBounds(rescale, document.crop) : null,
    layers: document.layers.map((layer) => {
      const from = layerBounds(layer);
      return scaleLayerToBounds(layer, from, transformBounds(rescale, from));
    }),
  };
}

export function resetEdits(document: EditorDocument): EditorDocument {
  return {
    ...document,
    transform: { rotation: 0, flipX: false, flipY: false },
    crop: null,
    aspectRatio: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    frame: null,
    layers: [],
    output: { ...document.output, width: null, height: null },
  };
}
