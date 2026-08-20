import type { EditorLayer } from "@pixen/core";
import type { AnnotationStyle } from "../../../tools/index.js";
import type { ChromeContext } from "../context.js";

/**
 * A style control writes to two places.
 *
 * The palette, always: it decides what the *next* annotation looks like, which
 * is the whole point of a control that is reachable with nothing selected. And
 * the selected layer, when there is one of the kind the control is about —
 * because changing the colour with a shape selected obviously means that shape.
 *
 * Three sections had their own copy of those two lines. The reason they belong
 * together is the interesting part, and it is written here once.
 *
 * The caller supplies the layer, already narrowed to the kind it is willing to
 * patch: the redaction controls must not write `{ mode }` onto a rectangle that
 * happens to be selected while the redact tool is armed.
 */
export type StyleWriter = (style: Partial<AnnotationStyle>, layerPatch?: Partial<EditorLayer>) => void;

export function styleWriter(context: ChromeContext, layer: EditorLayer | null): StyleWriter {
  return (style, layerPatch) => {
    context.actions.setAnnotationStyle(style);
    if (layer && layerPatch) context.editor.updateLayer(layer.id, layerPatch);
  };
}
