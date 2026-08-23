import { textBlock, type TextMeasurer } from "../../model/text-layout.js";
import type { TextLayer } from "../../model/types.js";
import type { DrawOp } from "./types.js";

/**
 * A caption as draw operations.
 *
 * The layout — which words land on which line, how wide the block is — is the
 * model's answer, so the renderer and the selection box cannot disagree about
 * it. What is decided here is only how the answer is drawn: where canvas wants
 * its anchor for each alignment, and how much room the plate leaves.
 */

/**
 * The breathing room a text plate leaves around the letters, as a fraction of
 * the type size — so a caption at 12px and the same caption at 200px look like
 * the same design rather than two.
 */
const TEXT_PLATE_PADDING_RATIO = 0.2;

export function textLayerOps(layer: TextLayer, measure: TextMeasurer): DrawOp[] {
  const { font, lines, lineHeight, width, height } = textBlock(layer, measure);

  // Canvas aligns text about the anchor, so the anchor moves with the alignment
  // while the layer's own position stays the top-left of the block.
  const originX =
    layer.align === "center"
      ? layer.position.x + width / 2
      : layer.align === "right"
        ? layer.position.x + width
        : layer.position.x;

  const padding = layer.fontSize * TEXT_PLATE_PADDING_RATIO;
  return [
    {
      op: "text",
      lines,
      origin: { x: originX, y: layer.position.y },
      lineHeight,
      font,
      align: layer.align,
      color: layer.color,
      ...(layer.backgroundColor
        ? {
            background: {
              color: layer.backgroundColor,
              rect: {
                x: layer.position.x - padding,
                y: layer.position.y - padding,
                width: width + padding * 2,
                height: height + padding * 2,
              },
            },
          }
        : {}),
    },
  ];
}
