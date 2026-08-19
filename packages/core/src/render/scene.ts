import { compose, IDENTITY, meanScale, scaling, translation } from "../geometry/matrix.js";
import { imageToStage, stageToOutput } from "../geometry/spaces.js";
import type { Matrix, Rect, Size } from "../geometry/types.js";
import { effectiveCrop, outputSize, stageRect } from "../model/document.js";
import type { Adjustments, EditorDocument, EditorLayer } from "../model/types.js";

export type SceneRegion = "crop" | "stage";

export interface SceneImageNode {
  source: CanvasImageSource;
  /** Pixel size of `source`, which may be a downscaled preview. */
  size: Size;
  /** source pixels -> target pixels */
  matrix: Matrix;
}

export interface SceneLayerNode {
  layer: EditorLayer;
  /** The bitmap an image layer draws, resolved from the resource manager. */
  resource?: CanvasImageSource;
  /** image space -> target pixels */
  matrix: Matrix;
  /** Target pixels per image pixel, for stroke widths and font sizes. */
  scale: number;
}

export interface Scene {
  region: SceneRegion;
  /** The stage-space rect being rendered. */
  sourceRect: Rect;
  /** Pixel size of the render target. */
  target: Size;
  background: string | null;
  /** CSS filter string, empty when nothing in the chain is active. */
  filter: string;
  /** The values behind that string, for the renderer's pixel fallback. */
  adjustments: Adjustments;
  image: SceneImageNode;
  layers: SceneLayerNode[];
  /** Target pixels per stage pixel. */
  scale: number;
}

export interface SceneInput {
  source: CanvasImageSource;
  /** Pixels of `source` per image pixel. 1 for the full-resolution bitmap. */
  sourceScale?: number;
  /**
   * Resolves an image layer's bitmap. Layers reference resources by id, and only
   * the caller knows which manager holds them.
   */
  resolveResource?: (resourceId: string) => CanvasImageSource | null;
}

export interface SceneOptions {
  region?: SceneRegion;
  /** Pixel size of the render target. Defaults to the region's own size. */
  target?: Size;
  /**
   * `stretch` (the default) maps the region onto the whole target, which is what
   * an export wants. `none` keeps the region at 1:1 and leaves placement to
   * `transform`, which is what a pannable, zoomable viewport wants.
   */
  fit?: "stretch" | "none";
  /** Applied after the region mapping — the viewport passes its view matrix here. */
  transform?: Matrix;
}

/**
 * Projects a document into a flat draw list.
 *
 * The scene is the single place where document state becomes geometry, which is
 * what lets the viewport and the export pipeline share one code path: they only
 * differ in which region they render and at what pixel size.
 */
export function createScene(document: EditorDocument, input: SceneInput, options: SceneOptions = {}): Scene {
  const region = options.region ?? "crop";
  const sourceRect = region === "crop" ? effectiveCrop(document) : stageRect(document);
  const target = options.target ?? (region === "crop" ? outputSize(document) : sizeOf(sourceRect));

  const fit = options.fit ?? "stretch";
  const view = options.transform ?? IDENTITY;

  const stageMatrix = imageToStage(document.source, document.transform);
  const regionMatrix =
    fit === "stretch" ? stageToOutput(sourceRect, target) : translation(-sourceRect.x, -sourceRect.y);
  const imageToTarget = compose(view, regionMatrix, stageMatrix);

  const sourceScale = input.sourceScale ?? 1;
  const scale = fit === "stretch" ? (target.width / sourceRect.width) * meanScale(view) : meanScale(view);
  const layerScale = Math.abs(scale);

  return {
    region,
    sourceRect,
    target,
    background: document.output.background,
    filter: cssFilter(document.adjustments),
    adjustments: document.adjustments,
    image: {
      source: input.source,
      size: {
        width: document.source.width * sourceScale,
        height: document.source.height * sourceScale,
      },
      // The preview bitmap is smaller than the image, so undo its scale first.
      matrix: compose(imageToTarget, scaling(1 / sourceScale)),
    },
    layers: document.layers
      .filter((layer) => layer.visible && layer.opacity > 0)
      .map((layer) => {
        const resource = layer.type === "image" ? input.resolveResource?.(layer.resourceId) : null;
        // An image layer whose bitmap is missing renders as nothing rather than
        // as an error: a document can outlive the sticker it referenced.
        return { layer, matrix: imageToTarget, scale: layerScale, ...(resource ? { resource } : {}) };
      }),
    scale,
  };
}

function sizeOf(rect: Rect): Size {
  return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
}

/**
 * Maps the document's adjustments onto a CSS filter string.
 *
 * Canvas2D filters are the pragmatic choice: the browser applies them to the
 * preview and the export through one code path, at no per-pixel cost of ours.
 * That is also the boundary of what this version adjusts — an adjustment the
 * platform cannot express as a filter would need a pixel pass on every frame,
 * which a slider drag on a large image cannot afford.
 *
 * The vignette is the one exception, and it is drawn rather than filtered.
 */
export function cssFilter(adjustments: Adjustments): string {
  const parts: string[] = [];
  // Exposure is photographic: one stop doubles the light, so it multiplies
  // where brightness only shifts.
  if (adjustments.exposure !== 0) parts.push(`brightness(${clampFactor(2 ** adjustments.exposure)})`);
  if (adjustments.brightness !== 0) parts.push(`brightness(${clampFactor(1 + adjustments.brightness)})`);
  if (adjustments.contrast !== 0) parts.push(`contrast(${clampFactor(1 + adjustments.contrast)})`);
  if (adjustments.saturation !== 0) parts.push(`saturate(${clampFactor(1 + adjustments.saturation)})`);
  if (adjustments.hue !== 0) parts.push(`hue-rotate(${Math.round(adjustments.hue)}deg)`);
  if (adjustments.grayscale !== 0) parts.push(`grayscale(${clampAmount(adjustments.grayscale)})`);
  if (adjustments.sepia !== 0) parts.push(`sepia(${clampAmount(adjustments.sepia)})`);
  if (adjustments.invert !== 0) parts.push(`invert(${clampAmount(adjustments.invert)})`);
  return parts.join(" ");
}

/** Filters are clamped so an absurd adjustment cannot blow out the image. */
const MAX_FILTER_FACTOR = 4;
const FILTER_PRECISION = 1000;

function clampFactor(value: number): number {
  const clamped = Math.min(MAX_FILTER_FACTOR, Math.max(0, value));
  return Math.round(clamped * FILTER_PRECISION) / FILTER_PRECISION;
}

function clampAmount(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * FILTER_PRECISION) / FILTER_PRECISION;
}
