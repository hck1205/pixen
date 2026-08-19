import { normaliseAngle, toDegrees, toRadians, type EditorLayer } from "@pixen/core";
import { button, divider, field, input } from "../../dom/index.js";
import { OPACITY_RANGE, ROTATION_RANGE } from "../../constants.js";
import type { ChromeContext } from "../context.js";
import { buildStyleControls } from "./style.js";

/**
 * The selected layer's own controls.
 *
 * What a layer offers follows from what it is: a bitmap has no stroke to
 * colour, and text has no stroke width. Opacity and rotation belong to every
 * layer, and the rotation field is how a precise angle is reached without
 * fighting the drag handle.
 *
 * Text is not edited here. It is edited on the canvas, where it appears —
 * double-click it, or press Enter with it selected. A second field for the same
 * string would be a second place to look.
 */
export function buildLayerControls(context: ChromeContext, layer: EditorLayer): Node[] {
  const { strings, editor } = context;
  const nodes: Node[] = [];

  // Which controls a layer offers follows from what it is — a bitmap has
  // nothing to stroke, text has no stroke width — and that decision lives in
  // `styleControlsFor` rather than in a chain of conditions here.
  nodes.push(...buildStyleControls(context, { tool: context.tool, layerType: layer.type }));

  nodes.push(
    field(
      strings.opacity,
      input({
        type: "range",
        ...OPACITY_RANGE,
        value: String(layer.opacity),
        dataset: { field: "opacity" },
        onInput: (value) => editor.updateLayer(layer.id, { opacity: Number(value) }),
      }),
    ),
    field(
      strings.rotation,
      input({
        type: "range",
        ...ROTATION_RANGE,
        value: String(Math.round(toDegrees(layer.rotation))),
        dataset: { field: "rotation" },
        onInput: (value) =>
          editor.updateLayer(layer.id, { rotation: normaliseAngle(toRadians(Number(value))) }),
      }),
    ),
    divider(),
    button({ icon: "trash", label: strings.delete, onClick: () => editor.removeLayer(layer.id) }),
  );
  return nodes;
}
