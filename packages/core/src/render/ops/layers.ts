import { compose, rotation, translation } from "../../geometry/matrix.js";
import { center } from "../../geometry/rect.js";
import type { Matrix, Point } from "../../geometry/types.js";
import { layerBounds } from "../../model/layers.js";
import type { TextMeasurer } from "../../model/text-layout.js";
import type { EditorLayer, ImageLayer, RedactLayer, RetouchLayer } from "../../model/types.js";
import { seedFrom } from "../scramble.js";
import type { SceneLayerNode } from "../scene.js";
import { ellipseLayerOps, lineLayerOps, pathLayerOps, rectLayerOps } from "./shapes.js";
import { textLayerOps } from "./text.js";
import type { DrawOp } from "./types.js";

/**
 * One layer at a time: which operations it becomes, and where it sits.
 *
 * The shapes and the caption are laid out next door; what is decided here is
 * the frame around them — the centre a layer's own rotation turns about, the
 * alpha and the matrix that go in front of the body, and which body a kind
 * asks for. The two kinds that are a single operation live here because
 * neither has a decision big enough to move.
 */
export function withLayerRotation(matrix: Matrix, rotationRadians: number, centre: Point): Matrix {
  if (!rotationRadians) return matrix;
  return compose(
    matrix,
    translation(centre.x, centre.y),
    rotation(rotationRadians),
    translation(-centre.x, -centre.y),
  );
}

/** Draws a bitmap into its frame, stretched or tiled. */
export function imageLayerOps(layer: ImageLayer, source: CanvasImageSource | undefined): DrawOp[] {
  if (!source) return [];
  return [{ op: "layer-image", source, frame: layer.frame, repeat: layer.repeat }];
}

/**
 * A redaction is one operation, whatever the mode: the executor decides how to
 * hide the region, and falls back to the solid fill when it cannot read the
 * canvas — a tainted canvas must not silently produce an unredacted export.
 */
export function redactLayerOps(layer: RedactLayer, imageLongestEdge: number): DrawOp[] {
  return [
    {
      op: "obscure",
      frame: layer.frame,
      mode: layer.mode,
      strength: Math.max(1, layer.strength * imageLongestEdge),
      colour: layer.colour,
      seed: seedFrom(layer.id),
    },
  ];
}

/**
 * A spot to heal: one operation, the ellipse inscribed in the frame.
 *
 * Like a redaction, the executor is what reads the canvas back — and, like a
 * redaction, a canvas it may not read leaves the picture alone rather than
 * failing, because a repair that did not happen is a visible blemish and not a
 * security hole.
 */
export function retouchLayerOps(layer: RetouchLayer): DrawOp[] {
  return [{ op: "heal", frame: layer.frame, feather: layer.feather }];
}

/** Image-space bounding box a layer's own rotation turns around. */
export function layerRotationCentre(layer: EditorLayer, measure: TextMeasurer): Point {
  return center(layerBounds(layer, measure));
}

export function layerOps(node: SceneLayerNode, measure: TextMeasurer, imageLongestEdge = 1): DrawOp[] {
  const { layer } = node;
  const matrix = withLayerRotation(node.matrix, layer.rotation, layerRotationCentre(layer, measure));
  const body = layerBodyOps(node, measure, imageLongestEdge);

  if (body.length === 0) return [];
  return [{ op: "alpha", value: layer.opacity }, { op: "transform", matrix }, ...body];
}

function layerBodyOps(node: SceneLayerNode, measure: TextMeasurer, imageLongestEdge: number): DrawOp[] {
  const { layer } = node;
  switch (layer.type) {
    case "rect":
      return rectLayerOps(layer);
    case "ellipse":
      return ellipseLayerOps(layer);
    case "line":
      return lineLayerOps(layer);
    case "path":
      return pathLayerOps(layer);
    case "text":
      return textLayerOps(layer, measure);
    case "image":
      return imageLayerOps(layer, node.resource);
    case "redact":
      return redactLayerOps(layer, imageLongestEdge);
    case "retouch":
      return retouchLayerOps(layer);
  }
}
