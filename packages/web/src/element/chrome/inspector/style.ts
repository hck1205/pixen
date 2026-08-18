import type { EditorLayer } from "@pixen/core";
import { field, input } from "../../dom/index.js";
import { STROKE_WIDTH_RANGE } from "../../constants.js";
import type { ChromeContext } from "../context.js";

/**
 * How the next annotation will look — and, when one is selected, how that one
 * looks too, since changing the colour with a shape selected obviously means
 * that shape.
 */
export function buildStyleControls(context: ChromeContext, options: { includeWidth: boolean }): Node[] {
  const { strings, annotationStyle, actions, editor } = context;

  const colour = input({
    type: "color",
    value: annotationStyle.colour,
    onInput: (value) => {
      actions.setAnnotationStyle({ colour: value });
      const selected = editor.ready ? editor.selectedLayer : null;
      if (selected) editor.updateLayer(selected.id, recolourPatch(selected, value));
    },
  });

  const nodes: Node[] = [field(strings.strokeColour, colour)];
  if (!options.includeWidth) return nodes;

  nodes.push(
    field(
      strings.strokeWidth,
      input({
        type: "range",
        ...STROKE_WIDTH_RANGE,
        value: String(annotationStyle.widthRatio),
        onInput: (value) => actions.setAnnotationStyle({ widthRatio: Number(value) }),
      }),
    ),
  );
  return nodes;
}

/**
 * Where a colour belongs on a given layer: text has a colour, a filled shape
 * recolours its fill, and everything else recolours its stroke.
 */
export function recolourPatch(layer: EditorLayer, colour: string): Partial<EditorLayer> {
  if (layer.type === "text") return { color: colour } as Partial<EditorLayer>;
  if (layer.type === "line" || layer.type === "path") {
    return { stroke: { ...layer.stroke, color: colour } } as Partial<EditorLayer>;
  }
  if (layer.fill) return { fill: colour } as Partial<EditorLayer>;
  return layer.stroke ? ({ stroke: { ...layer.stroke, color: colour } } as Partial<EditorLayer>) : {};
}
