import { button, divider } from "../../dom/index.js";
import { ratiosEqual } from "../../ratios.js";
import type { ChromeContext } from "../context.js";

/** Aspect ratios, rotation and flips — everything that shapes the crop. */
export function buildCropControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const current = editor.document.aspectRatio;

  const ratioButtons = context.ratios.map((ratio) =>
    button({
      label: `${strings.aspectRatio}: ${ratio.label}`,
      text: ratio.label,
      className: "text",
      active: ratiosEqual(current, ratio.value),
      onClick: () => editor.setAspectRatio(ratio.value),
    }),
  );

  return [
    ...ratioButtons,
    divider(),
    button({ icon: "rotateLeft", label: strings.rotateLeft, onClick: () => editor.rotateLeft() }),
    button({ icon: "rotateRight", label: strings.rotateRight, onClick: () => editor.rotateRight() }),
    button({ icon: "flipHorizontal", label: strings.flipHorizontal, onClick: () => editor.flipHorizontal() }),
    button({ icon: "flipVertical", label: strings.flipVertical, onClick: () => editor.flipVertical() }),
  ];
}
