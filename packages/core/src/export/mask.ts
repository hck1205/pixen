import { assertDrawableSize, drawnSurface, releaseSurface, type CanvasSurface } from "../image/canvas.js";
import { encodeSurface } from "../image/encode.js";
import { longestEdge } from "../geometry/rect.js";
import type { Rect, Size } from "../geometry/types.js";
import { outputSize as documentOutputSize } from "../model/document.js";
import type { EditorDocument, EditorLayer, ImageFormat } from "../model/types.js";
import { executeOps } from "../render/canvas2d/index.js";
import { buildSceneOps, type DrawOp, type StrokeStyle } from "../render/ops/index.js";
import { createScene } from "../render/scene.js";
import type { ResourceManager } from "../resources/manager.js";

/**
 * The marked areas of a picture, as a picture of their own.
 *
 * A mask is what a model outside the browser needs in order to work on part of
 * an image: inpainting, background removal, a selective adjustment. The shapes
 * for it already exist — someone drew them — so this renders the annotations
 * without the photograph underneath, in two flat colours.
 *
 * It is built by recolouring the draw-op list rather than by re-deriving where
 * every shape goes. That is the point of ops being data: the crop, the output
 * size, the rotation and every layer's own geometry have already been resolved
 * once, and a second implementation of any of it would be a second answer.
 */

/** White marks on black: what most models expect, and readable when opened. */
const DEFAULT_FOREGROUND = "#ffffff";
const DEFAULT_BACKGROUND = "#000000";
const MASK_FORMAT: ImageFormat = "image/png";
/** PNG ignores it, but `encodeSurface` asks for one. */
const LOSSLESS = 1;

export interface MaskOptions {
  /** Which layers are marks. Defaults to every visible layer. */
  include?: (layer: EditorLayer) => boolean;
  /** Output pixels. Defaults to what the document exports at. */
  size?: Size;
  /**
   * Grows every mark, as a fraction of the longest output edge.
   *
   * Inpainting wants a little margin: a mask that stops exactly at the edge of
   * the thing being replaced leaves a halo of the original behind.
   */
  padding?: number;
  /** Painted behind the marks. `null` leaves it transparent. */
  background?: string | null;
  /** Painted for the marks. */
  foreground?: string;
}

export function renderMask(
  document: EditorDocument,
  resources: ResourceManager,
  options: MaskOptions = {},
): CanvasSurface {
  const target = options.size ?? documentOutputSize(document);
  assertDrawableSize(target, "mask");

  const include = options.include ?? ((layer: EditorLayer) => layer.visible);
  const foreground = options.foreground ?? DEFAULT_FOREGROUND;
  const resource = resources.require(document.source.resourceId);

  const scene = createScene(
    { ...document, layers: document.layers.filter(include) },
    { source: resource.source, sourceScale: 1, resolveResource: resources.resolve },
    { region: "crop", target },
  );

  // Alpha only when nothing is painted behind the marks; an opaque context is
  // cheaper, and a mask with a background has nothing to be transparent about.
  const background = options.background === undefined ? DEFAULT_BACKGROUND : options.background;
  const grow = (options.padding ?? 0) * longestEdge(target);

  return drawnSurface(
    target,
    (surface) => {
      if (background !== null) {
        surface.context.fillStyle = background;
        surface.context.fillRect(0, 0, target.width, target.height);
      }
      executeOps(surface.context, maskOps(buildSceneOps(scene), foreground, grow));
    },
    background === null,
  );
}

export async function maskBlob(
  document: EditorDocument,
  resources: ResourceManager,
  options: MaskOptions = {},
): Promise<Blob> {
  const surface = renderMask(document, resources, options);
  try {
    // Always PNG: a mask is flat colour with hard edges, which is the one thing
    // a lossy encoder ruins — and a grey fringe is a wrong answer, not a
    // slightly worse-looking one.
    return await encodeSurface(surface.canvas, MASK_FORMAT, LOSSLESS);
  } finally {
    releaseSurface(surface);
  }
}

/**
 * The same drawing, in one colour, with the photograph taken out.
 *
 * Two rules do most of the work. Anything that only outlines a region becomes a
 * filled one: someone who draws a rectangle around a face has marked the face,
 * not four thin lines. And anything that is not a mark at all — the image, the
 * adjustments, the vignette, the frame — is dropped rather than recoloured,
 * because a mask of the whole picture marks nothing.
 */
export function maskOps(ops: readonly DrawOp[], foreground: string, padding = 0): DrawOp[] {
  const grow: StrokeStyle | undefined =
    padding > 0 ? { color: foreground, width: padding * 2, dash: [] } : undefined;
  const marked: DrawOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "transform":
        marked.push(op);
        break;
      case "path":
        // Filled whether or not it was: an outline marks what it encloses.
        marked.push({ ...op, fill: foreground, stroke: grow });
        break;
      case "layer-image":
      case "obscure":
        // A sticker or a redaction marks the area it covers, not its content.
        marked.push(filledRect(op.frame, foreground, grow));
        break;
      case "text":
        if (op.background) marked.push(filledRect(op.background.rect, foreground, grow));
        marked.push({ ...op, color: foreground, background: undefined });
        break;
      default:
        // Everything else is the picture, not a mark on it.
        break;
    }
  }
  return marked;
}

function filledRect(rect: Rect, colour: string, grow: StrokeStyle | undefined): DrawOp {
  return { op: "path", commands: [{ op: "rect", rect }], fill: colour, stroke: grow };
}
