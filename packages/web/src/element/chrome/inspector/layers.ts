import { button, element, hint } from "../../dom/index.js";
import type { ChromeContext } from "../context.js";
import { layerRows, type LayerRow } from "./layer-rows.js";

/**
 * The layer list.
 *
 * Everything drawn on the image, topmost first, with the four things a list is
 * for: choosing one, hiding one, locking one, and changing which is in front.
 * The order in the list is the order they are painted in, so moving a row up
 * moves the annotation in front of the ones above it.
 *
 * What each row can do is decided by `layerRows`; this builds the buttons.
 */
export function buildLayerList(context: ChromeContext): Node[] {
  const { editor, strings } = context;
  const selected = editor.selectedLayer;
  const rows = layerRows(editor.document.layers, selected?.id ?? null);

  if (rows.length === 0) return [hint(strings.layersEmpty)];

  const list = element("div", { className: "layer-list" });
  for (const row of rows) list.appendChild(buildRow(context, row));
  return [list];
}

function buildRow(context: ChromeContext, row: LayerRow): HTMLElement {
  const { editor, strings } = context;
  const name = row.title ?? strings[row.labelKey];
  const node = element("div", { className: "layer-row" });
  node.dataset.layer = row.id;

  node.append(
    button({
      icon: row.icon,
      label: name,
      text: name,
      className: "layer-name",
      active: row.selected,
      onClick: () => editor.select(row.id),
    }),
    button({
      icon: row.visible ? "visible" : "hidden",
      label: row.visible ? strings.layerHide : strings.layerShow,
      // Pressed means hidden: the toggle is on when it is doing something.
      active: !row.visible,
      onClick: () => editor.updateLayer(row.id, { visible: !row.visible }),
    }),
    button({
      icon: row.locked ? "locked" : "unlocked",
      label: row.locked ? strings.layerUnlock : strings.layerLock,
      active: row.locked,
      onClick: () => editor.updateLayer(row.id, { locked: !row.locked }),
    }),
    button({
      icon: "moveUp",
      label: strings.layerUp,
      disabled: row.upIndex === null,
      onClick: () => {
        if (row.upIndex !== null) editor.reorderLayer(row.id, row.upIndex);
      },
    }),
    button({
      icon: "moveDown",
      label: strings.layerDown,
      disabled: row.downIndex === null,
      onClick: () => {
        if (row.downIndex !== null) editor.reorderLayer(row.id, row.downIndex);
      },
    }),
    button({ icon: "trash", label: strings.delete, onClick: () => editor.removeLayer(row.id) }),
  );
  return node;
}
