import { compose, IDENTITY, meanScale, translation } from "../geometry/matrix.js";
import { roundedSize, transformBounds } from "../geometry/rect.js";
import { imageToStage, outputToStage, stageToOutput } from "../geometry/spaces.js";
import type { Matrix, Rect, Size } from "../geometry/types.js";
import { effectiveCrop, outputSize, stageRect } from "../model/document.js";
import type { Adjustments, EditorDocument, EditorLayer, FrameSettings } from "../model/types.js";
import { preprocessLayers, type ShapeProcessor } from "./preprocess.js";

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
  /**
   * The bitmap painted under the picture, already placed.
   *
   * Covering the region and centred, which is why the rect can hang outside it:
   * a backdrop that letterboxed would be a border, and a border is `frame`.
   */
  backdrop: { source: CanvasImageSource; rect: Rect; filtered: boolean } | null;
  /** The colour adjustments to apply, in the document's own units. */
  adjustments: Adjustments;
  /** The host's own colour transform, applied after the named adjustments. */
  colourMatrix: readonly number[] | null;
  /** The border drawn over everything, or null for none. */
  frame: FrameSettings | null;
  /**
   * Where the region lands on the target, in target pixels.
   *
   * The export's region *is* the target, but the viewport's is the picture
   * floating inside a much larger canvas — so anything drawn around the picture
   * rather than around the image needs this rather than `target`.
   */
  regionInTarget: Rect;
  image: SceneImageNode;
  layers: SceneLayerNode[];
  /** Target pixels per stage pixel. */
  scale: number;
}

export interface SceneInput {
  /**
   * Whatever is standing in for the picture: the bitmap itself, a downscaled
   * proxy, a frame of a video, or something the host swapped in.
   *
   * Its own size is not asked for and does not matter. The scene says where the
   * picture goes in image space and the executor stretches whatever it is given
   * into that box, so a proxy of any size lands in the same place at a
   * different resolution. There used to be a `sourceScale` here saying how big
   * the stand-in was; it cancelled itself out of the drawing and was read for
   * one thing it should never have decided — see `image.size` below.
   */
  source: CanvasImageSource;
  /**
   * The host's chance to rewrite each shape before it is drawn. See
   * `preprocessLayers`; an empty list, which is the default, is a no-op.
   */
  preprocess?: readonly ShapeProcessor[];
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

  // A layer in output space is measured in the exported image's own pixels
  // from its own top-left, so it stops at the region rather than going on
  // through the image's rotation and flips. That is the whole difference
  // between a caption written on the picture and one written on the frame.
  const outputToTarget = compose(view, regionMatrix, outputToStage(effectiveCrop(document), outputSize(document)));

  const scale = fit === "stretch" ? (target.width / sourceRect.width) * meanScale(view) : meanScale(view);
  const layerScale = Math.abs(scale);

  return {
    region,
    sourceRect,
    target,
    background: document.output.background,
    backdrop: backdropFor(document, input, transformBounds(compose(view, regionMatrix), sourceRect)),
    adjustments: document.adjustments,
    colourMatrix: document.colourMatrix,
    frame: document.frame,
    regionInTarget: transformBounds(compose(view, regionMatrix), sourceRect),
    image: {
      source: input.source,
      // The picture's own size, always — never the stand-in's. The executor
      // stretches whatever bitmap it is given into this box, so a proxy needs
      // no arithmetic; and this is also what a redaction's strength is a
      // fraction of, which is the reason it must not be the stand-in's size.
      // It was, and a blur measured against a quarter-size proxy came out four
      // times too small on screen while the exported file was right.
      size: { width: document.source.width, height: document.source.height },
      matrix: imageToTarget,
    },
    // Preprocessed first, then filtered: a processor may hide a layer by
    // returning it invisible, or produce one, and the visibility rule should
    // read the same either way.
    layers: preprocessLayers(document.layers, input.preprocess ?? [], {
      preview: options.region === "stage",
      transform: document.transform,
      scale: layerScale,
    })
      .filter((layer) => layer.visible && layer.opacity > 0)
      .map((layer) => {
        const resource = layer.type === "image" ? input.resolveResource?.(layer.resourceId) : null;
        const output = layer.space === "output";
        // An image layer whose bitmap is missing renders as nothing rather than
        // as an error: a document can outlive the sticker it referenced.
        return {
          layer,
          matrix: output ? outputToTarget : imageToTarget,
          // Stroke widths and type sizes are in the layer's own space, so the
          // scale that turns them into target pixels is its own too.
          scale: output ? Math.abs(meanScale(outputToTarget)) : layerScale,
          ...(resource ? { resource } : {}),
        };
      }),
    scale,
  };
}

/**
 * Where the backdrop lands, or null when there is not one.
 *
 * `cover` rather than `contain`: a backdrop exists to leave no gap, so the axis
 * that would have left one is the axis that overflows.
 */
function backdropFor(
  document: EditorDocument,
  input: SceneInput,
  region: Rect,
): Scene["backdrop"] {
  const id = document.output.backgroundImage;
  if (!id) return null;
  const source = input.resolveResource?.(id);
  // A document can outlive the backdrop it referenced, and a missing bitmap
  // renders as nothing rather than as an error — the same rule as an image
  // layer's.
  if (!source) return null;

  const natural = naturalSize(source);
  const scale = Math.max(region.width / natural.width, region.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    source,
    rect: {
      x: region.x + (region.width - width) / 2,
      y: region.y + (region.height - height) / 2,
      width,
      height,
    },
    filtered: document.output.backgroundFilter,
  };
}

/** What a drawable is, in its own pixels, whichever kind of drawable it is. */
function naturalSize(source: CanvasImageSource): Size {
  const measured = source as { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
  const width = measured.videoWidth || measured.width || 1;
  const height = measured.videoHeight || measured.height || 1;
  return { width, height };
}

function sizeOf(rect: Rect): Size {
  return roundedSize(rect.width, rect.height);
}
