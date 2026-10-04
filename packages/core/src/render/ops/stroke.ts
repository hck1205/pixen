/**
 * A stored stroke as the executor wants it.
 *
 * One line, and its own module because two builders need it and neither should
 * import the other: the layer builder draws the shaft, the line-end builder
 * draws what sits on the end of it.
 */
import type { Stroke } from "../../model/types.js";
import type { StrokeStyle } from "./types.js";

/** A dash pattern is optional in the document and always present in a draw op. */
export function toStrokeStyle(stroke: Stroke): StrokeStyle {
  return { color: stroke.color, width: stroke.width, dash: stroke.dash ?? [] };
}
