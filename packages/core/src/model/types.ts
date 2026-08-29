import type { SourceTransform } from "../geometry/spaces.js";
import type { Rect } from "../geometry/types.js";
import type { EditorLayer } from "./annotations.js";
import type { ClipSelection } from "./clip.js";
import type { LineEnd } from "./line.js";

export type { LineEnd };
export { LINE_ENDS } from "./line.js";

export const SCHEMA_VERSION = 14;

/**
 * Every format Pixen encodes, as the list rather than as a union — the same
 * pattern as `FRAME_STYLES` and `REDACTION_MODES`, so a picker, a validator and
 * a format probe can all be built from it instead of restating it.
 */
export const IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export {
  isFramedLayer,
  LAYER_SPACES,
  REDACTION_MODES,
  type EditorLayer,
  type EllipseLayer,
  type ImageLayer,
  type LayerSpace,
  type LayerType,
  type RedactionMode,
  type LineLayer,
  type PathLayer,
  type RectLayer,
  type RedactLayer,
  type RetouchLayer,
  type Stroke,
  type TextLayer,
} from "./annotations.js";

export interface SourceDescriptor {
  resourceId: string;
  width: number;
  height: number;
  /** Best-effort provenance, useful for filenames on export. */
  name?: string;
  mimeType?: string;
  /**
   * Seconds, for a source that runs rather than sits still.
   *
   * Absent for a photograph, which is the case this package was built for. It
   * lives beside `width` and `height` because it is the same kind of fact: how
   * far the source extends in one of its dimensions.
   */
  duration?: number;
}

/**
 * Every colour adjustment the document can carry, in the order they are applied
 * and shown.
 *
 * One list is the whole vocabulary: the type, the defaults, the validator, the
 * filter string, the pixel fallback and the inspector all read it, so a new
 * adjustment is added in one place rather than in six that must agree.
 */
export const ADJUSTMENT_KEYS = [
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "hue",
  "grayscale",
  "sepia",
  "invert",
  "vignette",
  // The three a canvas filter cannot express, and the reason there is still a
  // per-pixel pass when the browser *has* a filter. See `adjustmentPlan`.
  "gamma",
  "temperature",
  "tint",
] as const;

export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];

/** Every key is a number; what each range means lives in `model/adjustments.ts`. */
export type Adjustments = Record<AdjustmentKey, number>;

/**
 * A decorative border drawn over the finished picture.
 *
 * Document-level rather than a layer: a frame is not something you select and
 * drag, it belongs to the output the way the background colour does — and
 * keeping it out of `layers` means it cannot be reordered under an annotation.
 */
/**
 * The treatments a frame can take.
 *
 * Six, and they divide into two kinds: `solid`, `inset` and `rounded` are one
 * rectangle drawn differently, while `hook`, `line` and `edge` are not
 * rectangles at all — corner brackets, a set of parallel lines, and one line
 * per side drawn short of the corners. That is why the frame stopped being a
 * single executor with a switch in it and became a list of paths decided here.
 */
export const FRAME_STYLES = ["solid", "inset", "rounded", "hook", "line", "edge"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export interface FrameSettings {
  style: FrameStyle;
  /** Line thickness as a fraction of the output's longest edge. */
  width: number;
  colour: string;
  /** Corner radius as a fraction of the longest edge; `rounded` only. */
  radius: number;
  /** Distance from the edge, as a fraction of the longest edge. */
  inset: number;
  /**
   * Distance between the lines of a `line` frame, and how far an `edge` line is
   * drawn from the corner it starts at. A fraction of the longest edge.
   */
  offset: number;
  /** How many parallel lines a `line` frame draws. */
  count: number;
  /** Length of a corner bracket's arms, as a fraction of the longest edge. */
  armLength: number;
}

export interface OutputSettings {
  /** Resize target in output pixels; null keeps the cropped size. */
  width: number | null;
  height: number | null;
  format: ImageFormat | null;
  /**
   * Lossy quality, or null for "whatever suits the format".
   *
   * Nullable because the format is not known when a document is created: a
   * single stored number is one answer to a question two encoders ask
   * differently. See `resolveQuality`.
   */
  quality: number | null;
  /** Painted under the image; needed when exporting transparency to JPEG. */
  background: string | null;
  /**
   * A registered bitmap painted under the picture, over `background`.
   *
   * Scaled to cover the exported frame and centred, the way a backdrop behaves
   * — a picture that showed letterboxing would be a picture with a border, and
   * a border is what `frame` is for.
   *
   * A resource id rather than a source, like an image layer's, because a
   * document is JSON: bitmaps belong to the `ResourceManager`, keyed by id.
   */
  backgroundImage: string | null;
  /**
   * Whether the adjustments reach the backdrop as well as the picture.
   *
   * Off, because the backdrop is usually the host's own furniture — a studio
   * sweep, a brand panel — and desaturating the photograph is not a reason to
   * desaturate the wall behind it. On, it is treated as part of the picture.
   */
  backgroundFilter: boolean;
  /**
   * Whether a target larger than the source may enlarge the picture.
   *
   * Off, because enlarging is a thing to ask for rather than a thing to be
   * given: a host that types 4000 into a width field for a 1600-pixel photograph
   * almost always means "no larger than 4000". `resolveSize` has refused by
   * default since it was written and `outputSize` did not, so the same request
   * produced 1600 pixels one way and 4000 the other, depending on whether it
   * came through the panel or the batch call.
   *
   * When it is on, the target is honoured exactly, which is what an export at
   * 2× for a retina asset needs.
   */
  upscale: boolean;
}

export interface EditorDocument {
  schemaVersion: number;
  source: SourceDescriptor;
  transform: SourceTransform;
  /** Stage-space crop region. Absent means "the whole stage". */
  crop: Rect | null;
  /**
   * Whether the crop has to stay inside the picture.
   *
   * True, which is what a crop usually means: take a piece out of this
   * photograph. False lets the crop hang off the edges, so a square can be cut
   * from a panorama without losing its ends and a rotated picture keeps its
   * corners instead of being zoomed in to hide them. What lies outside is
   * whatever `output.background` and `output.backgroundImage` put there.
   *
   * The bound is the stage rect — the picture's own rectangle after its
   * rotation and flips — because that is the rectangle a crop is measured
   * against everywhere else.
   */
  cropWithinImage: boolean;
  /**
   * The kept parts of a moving source, in seconds — in order and never
   * overlapping. Absent means all of it, and is what a still picture always
   * has. See `model/clip.ts`.
   */
  clip: ClipSelection | null;
  /** Locked crop ratio, kept in the document so a resumed session behaves the same. */
  aspectRatio: number | null;
  adjustments: Adjustments;
  /**
   * A colour transform the host wrote, applied after the named adjustments.
   *
   * The twelve adjustments are a vocabulary — sliders a person understands. A
   * brand look is not in it, and a product that only offers the words we
   * thought of is one somebody has to fork. Twenty numbers, four rows of five,
   * in the order the platform's own colour matrices use. Null for none, which
   * is what every document has until a host says otherwise.
   */
  colourMatrix: readonly number[] | null;
  /** A border drawn over everything, or null for none. */
  frame: FrameSettings | null;
  layers: EditorLayer[];
  output: OutputSettings;
  /** Host-owned data. Pixen round-trips it and never reads it. */
  meta: Record<string, unknown>;
}

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze(
  Object.fromEntries(ADJUSTMENT_KEYS.map((key) => [key, 0])) as Adjustments,
);

export const DEFAULT_OUTPUT: Readonly<OutputSettings> = Object.freeze({
  width: null,
  height: null,
  format: null,
  quality: null,
  background: null,
  backgroundImage: null,
  backgroundFilter: false,
  upscale: false,
});

/** A crop is a piece of the picture unless a host says otherwise. */
export const DEFAULT_CROP_WITHIN_IMAGE = true;
