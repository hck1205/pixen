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
  /** CSS filter string, empty when no adjustment is active. */
  filter: string;
  image: SceneImageNode;
  layers: SceneLayerNode[];
  /** Target pixels per stage pixel. */
  scale: number;
}

export interface SceneInput {
  source: CanvasImageSource;
  /** Pixels of `source` per image pixel. 1 for the full-resolution bitmap. */
  sourceScale?: number;
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
      .map((layer) => ({ layer, matrix: imageToTarget, scale: layerScale })),
    scale,
  };
}

function sizeOf(rect: Rect): Size {
  return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
}

/**
 * Maps adjustments in the range [-1, 1] onto a CSS filter string.
 *
 * Canvas2D filters are the pragmatic V1 choice: correct enough for preview and
 * export alike, and free of the shader pipeline a WebGL renderer would need.
 */
export function cssFilter(adjustments: Adjustments): string {
  const parts: string[] = [];
  if (adjustments.brightness !== 0) parts.push(`brightness(${clampFactor(1 + adjustments.brightness)})`);
  if (adjustments.contrast !== 0) parts.push(`contrast(${clampFactor(1 + adjustments.contrast)})`);
  if (adjustments.saturation !== 0) parts.push(`saturate(${clampFactor(1 + adjustments.saturation)})`);
  return parts.join(" ");
}

function clampFactor(value: number): number {
  return Math.round(Math.min(4, Math.max(0, value)) * 1000) / 1000;
}
