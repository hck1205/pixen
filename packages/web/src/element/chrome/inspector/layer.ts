import { normaliseAngle, type EditorLayer } from "@pixen/core";
import { button, divider, field, input } from "../../dom/index.js";
import { OPACITY_RANGE, ROTATION_RANGE } from "../../constants.js";
import type { ChromeContext } from "../context.js";
import { buildStyleControls } from "./style.js";

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * The selected layer's own controls.
 *
 * What a layer offers follows from what it is: a bitmap has no stroke to
 * colour, and text has no stroke width. Opacity and rotation belong to every
 * layer, and the rotation field is how a precise angle is reached without
 * fighting the drag handle.
 */
export function buildLayerControls(context: ChromeContext, layer: EditorLayer): Node[] {
  const { strings, editor } = context;
  const nodes: Node[] = [];

  if (layer.type === "text") {
    nodes.push(
      field(
        strings.text,
        input({
          type: "text",
          value: layer.text,
          placeholder: strings.textPlaceholder,
          dataset: { field: "text" },
          onInput: (value) => editor.updateLayer(layer.id, { text: value }),
        }),
      ),
    );
  }

  // A bitmap has nothing to stroke; text carries a colour but no width.
  if (layer.type !== "image") {
    nodes.push(...buildStyleControls(context, { includeWidth: layer.type !== "text" }));
  }

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
        value: String(Math.round(layer.rotation * DEGREES_PER_RADIAN)),
        dataset: { field: "rotation" },
        onInput: (value) =>
          editor.updateLayer(layer.id, { rotation: normaliseAngle(Number(value) / DEGREES_PER_RADIAN) }),
      }),
    ),
    divider(),
    button({ icon: "trash", label: strings.delete, onClick: () => editor.removeLayer(layer.id) }),
  );
  return nodes;
}
