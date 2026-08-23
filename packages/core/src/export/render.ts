/**
 * The picture without a file around it.
 *
 * `exportDocument` next door answers "give me a file": it encodes, it carries
 * metadata, it searches for a byte budget, it names the result. None of that is
 * wanted by a host uploading a texture to WebGL or handing pixels to a model,
 * and all of it is in the way. These two are the same render with the file part
 * left off — which is why they are here rather than there.
 */
import { assertDrawableSize, drawnSurface, releaseSurface, type CanvasSurface } from "../image/canvas.js";
import { outputSize as documentOutputSize } from "../model/document.js";
import type { EditorDocument } from "../model/types.js";
import type { Size } from "../geometry/types.js";
import { renderScene } from "../render/canvas2d/index.js";
import { createScene } from "../render/scene.js";
import type { ResourceManager } from "../resources/manager.js";
import type { ShapeProcessor } from "../render/preprocess.js";

export interface PictureOptions {
  target?: Size;
  region?: "crop" | "stage";
  /** Rules over each shape before it is drawn. See `preprocessLayers`. */
  preprocess?: readonly ShapeProcessor[];
}

/**
 * Renders to a canvas without encoding, for hosts that want pixels — a WebGL
 * upload, an ImageData read, or their own encoder.
 *
 * The caller owns what comes back and releases it with `releaseSurface`.
 */
export function renderDocumentToCanvas(
  document: EditorDocument,
  resources: ResourceManager,
  options: PictureOptions = {},
): CanvasSurface {
  const resource = resources.require(document.source.resourceId);
  const region = options.region ?? "crop";
  const target = options.target ?? documentOutputSize(document);
  assertDrawableSize(target, "render target");

  const scene = createScene(
    document,
    { source: resource.source, resolveResource: resources.resolve, preprocess: options.preprocess },
    { region, target },
  );
  return drawnSurface(target, (surface) => renderScene(surface.context, scene));
}

/**
 * The finished picture as raw pixels.
 *
 * The third of the three shapes an export can take — a file, a canvas, and the
 * bytes themselves — and the one a host reaches for when the picture is going
 * somewhere that has no use for a container: a model's input tensor, a WASM
 * filter, a pixel-by-pixel comparison in a test.
 *
 * The surface is released before returning, because unlike the canvas above
 * there is nothing left for the caller to own: `getImageData` copies the pixels
 * out, so keeping the canvas alive would keep a second copy of them.
 */
export function renderDocumentToImageData(
  document: EditorDocument,
  resources: ResourceManager,
  options: PictureOptions = {},
): ImageData {
  const surface = renderDocumentToCanvas(document, resources, options);
  try {
    return surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height);
  } finally {
    releaseSurface(surface);
  }
}
