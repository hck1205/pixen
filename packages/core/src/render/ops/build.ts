import { IDENTITY } from "../../geometry/matrix.js";
import { longestEdge } from "../../geometry/rect.js";
import type { Scene } from "../scene.js";
import { adjustmentPlan } from "../adjustments.js";
import { frameOps } from "./frames.js";
import { layerOps } from "./layers.js";
import { estimateTextWidth } from "../../model/text-layout.js";
import type { BuildOptions, DrawOp } from "./types.js";

/**
 * The whole frame, assembled in draw order.
 *
 * This is the only module that knows what comes before what: background, image,
 * adjustment, vignette, layers, frame. Everything it assembles was decided
 * elsewhere.
 */

/**
 * The whole frame as a list of operations, in draw order.
 *
 * Colour adjustment takes the canvas `filter` when the engine has one and the
 * pixel path when it does not, so a preview and an export cannot disagree
 * because of a browser capability.
 */
export function buildSceneOps(scene: Scene, options: BuildOptions = {}): DrawOp[] {
  const measure = options.measureText ?? estimateTextWidth;
  // What this engine has to do to reach the same picture as the other one.
  const plan = adjustmentPlan(scene.adjustments, scene.filter, options.contextFilter !== false);
  const useFilter = plan.filter !== "";
  const ops: DrawOp[] = [];

  if (options.clear !== false) {
    ops.push({ op: "clear", width: scene.target.width, height: scene.target.height });
  }
  if (scene.background) {
    // Under the picture, not over the canvas. On an export those are the same
    // rectangle; in the editor the second one paints the whole workspace the
    // colour a host chose for the file's transparency.
    ops.push({ op: "fill-under", color: scene.background, rect: scene.regionInTarget });
  }

  if (useFilter) ops.push({ op: "filter", value: plan.filter });
  ops.push(
    { op: "alpha", value: 1 },
    { op: "transform", matrix: scene.image.matrix },
    { op: "image", source: scene.image.source, width: scene.image.size.width, height: scene.image.size.height },
  );
  if (useFilter) ops.push({ op: "filter", value: "none" });

  if (plan.pixels) {
    ops.push({
      op: "adjust-pixels",
      adjustments: plan.pixels,
      width: scene.target.width,
      height: scene.target.height,
    });
  }

  if (scene.adjustments.vignette > 0) {
    // Over the image and under the annotations: the vignette is part of the
    // picture, and an arrow drawn on top should not be dimmed by it.
    //
    // Around the picture rather than around the canvas, for the same reason the
    // frame is — and it was around the canvas. On an export those are the same
    // rectangle, so the file was right and only the editor was wrong: the
    // darkening was centred on the viewport and its corners fell outside the
    // photograph, which is the one place a vignette is supposed to be.
    ops.push({
      op: "vignette",
      rect: scene.regionInTarget,
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
  // In target space, which the identity transform says out loud rather than
  // leaving the executor to reset it on the frame's behalf.
  if (scene.frame) {
    ops.push({ op: "transform", matrix: IDENTITY }, ...frameOps(scene.frame, scene.regionInTarget));
  }

  return ops;
}
