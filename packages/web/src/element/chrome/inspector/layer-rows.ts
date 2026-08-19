import type { EditorLayer } from "@pixen/core";
import type { PixenStrings } from "../../../i18n/index.js";
import type { IconName } from "../../../theme/index.js";

/**
 * What a layer list shows, as data.
 *
 * The list itself is the only interesting part of a layer panel: the order to
 * read it in, what each row is called, and which of its buttons can do anything.
 * All three are decisions over the document, so they are made here — where a
 * test can ask "is the top layer's *up* button dead?" — and the builder is left
 * holding nothing but buttons.
 */
export interface LayerRow {
  id: string;
  type: EditorLayer["type"];
  /** The layer's own name, or a text layer's own words. Null when it has neither. */
  title: string | null;
  /** What to call the kind of layer, when the row has no title of its own. */
  labelKey: keyof PixenStrings;
  /** How the kind of layer is drawn in the list. */
  icon: IconName;
  selected: boolean;
  visible: boolean;
  locked: boolean;
  /**
   * Where `reorderLayer` should put the layer to move it one step towards the
   * front or the back, or null when it is already at that end.
   */
  upIndex: number | null;
  downIndex: number | null;
}

/** Long enough to tell two captions apart, short enough to stay on one row. */
const TITLE_MAX_LENGTH = 24;
const ELLIPSIS = "…";

/** How each kind of layer names and draws itself in the list. */
interface LayerAppearance {
  labelKey: keyof PixenStrings;
  icon: IconName;
}

const LAYER_APPEARANCE: Record<EditorLayer["type"], LayerAppearance> = {
  rect: { labelKey: "rectangle", icon: "rectangle" },
  ellipse: { labelKey: "ellipse", icon: "ellipse" },
  line: { labelKey: "arrow", icon: "arrow" },
  path: { labelKey: "draw", icon: "draw" },
  text: { labelKey: "text", icon: "text" },
  image: { labelKey: "sticker", icon: "sticker" },
  redact: { labelKey: "redact", icon: "redact" },
};

/**
 * The rows, front to back.
 *
 * The document stores layers back to front, because that is the order they are
 * painted in; a list is read the other way round, because the thing on top is
 * the thing you just drew.
 */
export function layerRows(layers: readonly EditorLayer[], selectedId: string | null = null): LayerRow[] {
  const top = layers.length - 1;
  return layers
    .map((layer, index) => ({
      id: layer.id,
      type: layer.type,
      title: titleOf(layer),
      ...LAYER_APPEARANCE[layer.type],
      selected: layer.id === selectedId,
      visible: layer.visible,
      locked: layer.locked,
      upIndex: index < top ? index + 1 : null,
      downIndex: index > 0 ? index - 1 : null,
    }))
    .reverse();
}

/** A layer's own name, a text layer's own words, or nothing. */
function titleOf(layer: EditorLayer): string | null {
  if (layer.name) return truncate(layer.name);
  if (layer.type === "text") {
    const text = layer.text.replace(/\s+/g, " ").trim();
    return text === "" ? null : truncate(text);
  }
  return null;
}

function truncate(text: string): string {
  return text.length <= TITLE_MAX_LENGTH ? text : `${text.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}${ELLIPSIS}`;
}
