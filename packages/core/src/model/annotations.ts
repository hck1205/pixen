import type { Point, Rect } from "../geometry/types.js";
import { LINE_ENDS, type LineEnd } from "./line.js";

/**
 * What an annotation is: the seven kinds, and what each one stores.
 *
 * Kept apart from the document because they are a different question. A
 * document is a picture and what has been decided about it; a layer is one of
 * those decisions, and "what does an arrow store" should not mean reading past
 * the output settings to find out.
 */
export { LINE_ENDS };
export type { LineEnd };

/**
 * Which frame of reference a layer's coordinates are in.
 *
 * `image` is the picture's own pixels: the layer rides the rotation and the
 * flips, so a caption written across someone's face stays across their face
 * when the photograph is turned. Every layer was this, and it is the default.
 *
 * `output` is the exported image's own pixels, from its own top-left. The
 * layer does not turn with the picture and does not move when the crop does —
 * it belongs to the frame rather than to what is inside it, which is what a
 * watermark, a caption bar or a logo in the corner actually wants.
 *
 * The two names are two of the four spaces in `geometry/spaces.ts`, because
 * they are those spaces rather than something new.
 */
export const LAYER_SPACES = ["image", "output"] as const;
export type LayerSpace = (typeof LAYER_SPACES)[number];

export interface Stroke {
  color: string;
  width: number;
  /** Dash pattern in image-space units; empty means solid. */
  dash?: number[];
}

interface LayerBase {
  id: string;
  name?: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** Whose pixels this layer's coordinates are in. See `LAYER_SPACES`. */
  space: LayerSpace;
  /** Rotation of the layer itself, radians, around its own centre. */
  rotation: number;
}

/** Every layer stores its geometry in image space, so rotate/flip never rewrites it. */
export interface RectLayer extends LayerBase {
  type: "rect";
  frame: Rect;
  stroke: Stroke | null;
  fill: string | null;
  cornerRadius: number;
}

export interface EllipseLayer extends LayerBase {
  type: "ellipse";
  frame: Rect;
  stroke: Stroke | null;
  fill: string | null;
}

export interface LineLayer extends LayerBase {
  type: "line";
  from: Point;
  to: Point;
  stroke: Stroke;
  /** The decoration at `from`, and the one at `to`. See `LINE_ENDS`. */
  startStyle: LineEnd;
  endStyle: LineEnd;
}

export interface PathLayer extends LayerBase {
  type: "path";
  points: Point[];
  stroke: Stroke;
  closed: boolean;
}

export interface TextLayer extends LayerBase {
  type: "text";
  position: Point;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
  backgroundColor: string | null;
  /** Wrapping width in image space; null lets the line run. */
  maxWidth: number | null;
}

/**
 * A bitmap placed on the image: a sticker, a logo, a watermark.
 *
 * Like the source image, the pixels live in the `ResourceManager` and the layer
 * carries only an id — so a document with ten stickers is still small JSON, and
 * the same bitmap placed twice is decoded once.
 */
export interface ImageLayer extends LayerBase {
  type: "image";
  resourceId: string;
  frame: Rect;
  /** Tiles the bitmap across the frame instead of stretching it once. */
  repeat: boolean;
}

/**
 * How a redaction hides what is underneath.
 *
 * `solid` is the only mode that removes information outright, which is why it is
 * the default; `blur` and `pixelate` obscure, and the difference matters when
 * the content is sensitive. See docs/SECURITY.md.
 */
export const REDACTION_MODES = ["solid", "blur", "pixelate", "scramble"] as const;
export type RedactionMode = (typeof REDACTION_MODES)[number];

export interface RedactLayer extends LayerBase {
  type: "redact";
  frame: Rect;
  mode: RedactionMode;
  /** Blur radius, or pixel block size, as a fraction of the image's longest edge. */
  strength: number;
  /** Fill used by `solid`, and as the fallback when pixels cannot be read back. */
  colour: string;
}

/**
 * A blemish taken out by growing the surroundings over it.
 *
 * Stored as a rectangle like everything else, and read as the ellipse inscribed
 * in it — so a spot moves, resizes and scales with the same code every other
 * layer uses, and only the drawing knows it is round.
 *
 * It is a layer rather than a brush stroke baked into the picture because
 * everything here is: the source bitmap is never written to, so a repair can be
 * undone, moved, or lifted out of a saved document a year later.
 */
export interface RetouchLayer extends LayerBase {
  type: "retouch";
  frame: Rect;
  /** How much of the radius fades back to the picture. See `healRegion`. */
  feather: number;
}

export type EditorLayer =
  | RectLayer
  | EllipseLayer
  | LineLayer
  | PathLayer
  | TextLayer
  | ImageLayer
  | RedactLayer
  | RetouchLayer;
export type LayerType = EditorLayer["type"];

/**
 * Whether a layer is one of the kinds a rectangle describes.
 *
 * Five of the eight are, and that list was written out four times — in the
 * bounds, the translate, the resize and the stray-tap test — once in a
 * different order, which is how you can tell they were written rather than
 * copied. Deriving the union from the shape means there is no list at all: a
 * new layer type with a `frame` is one of these on the day it is declared.
 */
export function isFramedLayer(layer: EditorLayer): layer is Extract<EditorLayer, { frame: Rect }> {
  return "frame" in layer;
}
