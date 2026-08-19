import { button, hint } from "../../dom/index.js";
import type { ChromeContext } from "../context.js";

/**
 * The stickers the host offered, as a row of buttons.
 *
 * Clicking one places it in the middle of the visible crop and selects it, so
 * the handles are already on the thing you just added. There is no drag from
 * here onto the canvas: it would be a second way to do what a click and a drag
 * already do, on touch as well as with a mouse.
 */
export function buildStickerControls(context: ChromeContext): Node[] {
  const { strings, stickers, actions } = context;
  if (stickers.length === 0) return [hint(strings.stickerHint)];

  return stickers.map((sticker) =>
    button({
      label: sticker.label,
      text: sticker.label,
      className: "text",
      onClick: () => actions.placeSticker(sticker),
    }),
  );
}
