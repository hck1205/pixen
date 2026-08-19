import type { EditorLayer } from "@pixen/core";
import { button, divider, field, input } from "../../dom/index.js";
import type { ChromeContext } from "../context.js";
import { buildStyleControls } from "./style.js";

/** The selected annotation: its text if it has any, its colour, and delete. */
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

  // Text layers carry a colour but no stroke width.
  nodes.push(...buildStyleControls(context, { includeWidth: layer.type !== "text" }));
  nodes.push(
    divider(),
    button({ icon: "trash", label: strings.delete, onClick: () => editor.removeLayer(layer.id) }),
  );
  return nodes;
}
