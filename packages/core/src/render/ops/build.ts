import { longestEdge } from "../../geometry/rect.js";
import type { Rect, Size } from "../../geometry/types.js";
import type { FrameSettings } from "../../model/types.js";
import type { Scene } from "../scene.js";
import { layerOps } from "./layers.js";
import { estimateTextWidth } from "./text.js";
import type { BuildOptions, DrawOp } from "./types.js";

/**
 * The whole frame, assembled in draw order.
 *
 * This is the only module that knows what comes before what: background, image,
 * adjustment, vignette, layers, frame. Everything it assembles was decided
 * elsewhere.
 */

/**
 * Resolves a frame's fractions against the target it is drawn on.
 *
 * Stored as fractions so one setting suits a thumbnail and a 6000px export;
 * resolved here so the executor only ever sees pixels.
 */
export function frameOp(frame: FrameSettings, region: Rect): Extract<DrawOp, { op: "frame" }> {
  const edge = longestEdge(region);
  return {
    op: "frame",
    rect: region,
    style: frame.style,
    width: Math.max(1, frame.width * edge),
    radius: Math.max(0, frame.radius * edge),
    inset: Math.max(0, frame.inset * edge),
    colour: frame.colour,
  };
}

/**
 * The whole frame as a list of operations, in draw order.
 *
 * Colour adjustment takes the canvas `filter` when the engine has one and the
 * pixel path when it does not, so a preview and an export cannot disagree
 * because of a browser capability.
 */
export function buildSceneOps(scene: Scene, options: BuildOptions = {}): DrawOp[] {
  const measure = options.measureText ?? estimateTextWidth;
  const useFilter = scene.filter !== "" && options.contextFilter !== false;
  const ops: DrawOp[] = [];

  if (options.clear !== false) {
    ops.push({ op: "clear", width: scene.target.width, height: scene.target.height });
  }
  if (scene.background) {
    ops.push({
      op: "fill-viewport",
      color: scene.background,
      width: scene.target.width,
      height: scene.target.height,
    });
  }

  if (useFilter) ops.push({ op: "filter", value: scene.filter });
  ops.push(
    { op: "alpha", value: 1 },
    { op: "transform", matrix: scene.image.matrix },
    { op: "image", source: scene.image.source, width: scene.image.size.width, height: scene.image.size.height },
  );
  if (useFilter) ops.push({ op: "filter", value: "none" });

  if (!useFilter && scene.filter !== "") {
    ops.push({
      op: "adjust-pixels",
      adjustments: scene.adjustments,
      width: scene.target.width,
      height: scene.target.height,
    });
  }

  if (scene.adjustments.vignette > 0) {
    // Over the image and under the annotations: the vignette is part of the
    // picture, and an arrow drawn on top should not be dimmed by it.
    ops.push({
      op: "vignette",
      rect: { x: 0, y: 0, width: scene.target.width, height: scene.target.height },
      strength: scene.adjustments.vignette,
    });
  }

  if (options.skipLayers !== true) {
    // Redaction strengths are fractions of the image, so the builder needs to
    // know how big the image is.
    const edge = longestEdge(scene.image.size);
    for (const node of scene.layers) ops.push(...layerOps(node, measure, edge));
  }

  // Around the picture, not around the canvas: in the viewport those differ.
  if (scene.frame) ops.push(frameOp(scene.frame, scene.regionInTarget));

  return ops;
}
