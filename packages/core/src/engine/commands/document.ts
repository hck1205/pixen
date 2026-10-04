/**
 * The document's own settings, and the two commands that touch all of it.
 *
 * Adjustments, the frame, the output settings: each is a shallow merge over
 * what is there, so a caller changes one field without restating the rest.
 * `replaceSource` and `resetEdits` are the exceptions — they rewrite the whole
 * document, and are here because there is nowhere narrower for them to be.
 */
import { PixenError } from "../../errors/index.js";
import { COLOUR_MATRIX_LENGTH, isColourMatrix } from "../../render/colour-matrix.js";
import { scaling } from "../../geometry/matrix.js";
import { transformBounds } from "../../geometry/rect.js";
import { cropBounds } from "../../model/document.js";
import { clampAdjustments } from "../../model/adjustments.js";
import { constrainRect } from "../../geometry/rect.js";
import { clampSelection, clipLimits, type ClipBounds, type ClipRange, type ClipSelection } from "../../model/clip.js";
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

/**
 * The host's own colour transform, or none.
 *
 * Checked here rather than trusted: a matrix of the wrong length would reach
 * the pixel pass and be ignored, which looks exactly like a transform that did
 * nothing — and a caller who mistyped one deserves to hear about it.
 */
export function setColourMatrix(document: EditorDocument, matrix: readonly number[] | null): EditorDocument {
  if (matrix === null) return { ...document, colourMatrix: null };
  if (!isColourMatrix(matrix)) {
    throw new PixenError("INVALID_DOCUMENT", `A colour matrix is ${COLOUR_MATRIX_LENGTH} finite numbers`, {
      details: { received: (matrix as readonly number[]).length },
    });
  }
  return { ...document, colourMatrix: [...matrix] };
}

/**
 * Whether the crop has to stay inside the picture.
 *
 * Turning it back on brings an overhanging crop home rather than leaving the
 * document in a state its own rule forbids — the same reason clearing a trim
 * under a ceiling leaves the longest clip the rule allows.
 */
export function setCropWithinImage(document: EditorDocument, within: boolean): EditorDocument {
  const next = { ...document, cropWithinImage: within };
  if (!within || !next.crop) return next;
  return { ...next, crop: constrainRect(next.crop, cropBounds(next), { aspectRatio: next.aspectRatio }) };
}

/**
 * Swaps the pixels under an edit, keeping the edit.
 *
 * The use for this is a round trip through something else — a background
 * remover, an upscaler, a service that retouches — after which the host wants
 * the *same* crop, the same annotations and the same undo stack, over different
 * pixels.
 *
 * Geometry is stored in image space, so a replacement of a different size would
 * leave every mark in the wrong place. A uniform rescale is unambiguous and is
 * applied; a different aspect ratio is not, so it is refused rather than
 * silently mangling the edit — the caller knows what they meant and can say so
 * by cropping first.
 */
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

/**
 * Sets the kept time range, or clears it back to the whole source.
 *
 * Clamped against the source's own duration rather than taken as given: the
 * range usually arrives from a dragged handle, and a handle can be dragged past
 * the end of the picture. A source with no duration is a still one, where the
 * only honest answer is that it has no clip at all.
 *
 * Clearing it is where a length rule earns its keep. `null` means the whole
 * source, and a host with a ceiling has said the whole source is not something
 * it will take — so clearing a trim under a ceiling leaves the longest clip the
 * rule allows rather than no clip at all. Otherwise the document could hold a
 * state the host had already refused, and the export would write it out.
 */
export function setClip(
  document: EditorDocument,
  selection: ClipSelection | ClipRange | null,
  bounds?: ClipBounds,
): EditorDocument {
  const duration = document.source.duration;
  if (duration === undefined) return { ...document, clip: null };

  if (selection !== null) {
    const ranges = Array.isArray(selection) ? selection : [selection as ClipRange];
    return { ...document, clip: clampSelection(ranges, duration, bounds) };
  }

  const { ceiling } = clipLimits(duration, bounds);
  if (ceiling >= duration) return { ...document, clip: null };
  return { ...document, clip: clampSelection([{ start: 0, end: ceiling }], duration, bounds) };
}

export function resetEdits(document: EditorDocument): EditorDocument {
  return {
    ...document,
    transform: { rotation: 0, flipX: false, flipY: false },
    crop: null,
    clip: null,
    aspectRatio: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    frame: null,
    layers: [],
    output: { ...document.output, width: null, height: null },
  };
}
