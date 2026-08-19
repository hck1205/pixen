import { straightenAngleOf } from "@pixen/core";
import { button, divider, field, input } from "../../dom/index.js";
import { STRAIGHTEN_RANGE } from "../../constants.js";
import { ratiosEqual } from "../../ratios.js";
import type { ChromeContext } from "../context.js";

const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Aspect ratios, straightening, rotation and flips — everything that shapes the crop. */
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

  // The slider shows the angle the document holds, not one the UI accumulates,
  // so it stays truthful across undo and across a quarter turn.
  const straighten = field(
    strings.straighten,
    input({
      type: "range",
      ...STRAIGHTEN_RANGE,
      value: String(Math.round(straightenAngleOf(editor.document.transform.rotation) * DEGREES_PER_RADIAN * 2) / 2),
      dataset: { field: "straighten" },
      onInput: (value) => editor.straighten(Number(value) / DEGREES_PER_RADIAN),
      // A slider drag is one gesture, so it collapses into one undo step.
      onPointerDown: () => editor.beginTransaction(strings.straighten),
      onPointerUp: () => editor.commitTransaction(),
    }),
  );

  return [
    ...ratioButtons,
    divider(),
    straighten,
    divider(),
    button({ icon: "rotateLeft", label: strings.rotateLeft, onClick: () => editor.rotateLeft() }),
    button({ icon: "rotateRight", label: strings.rotateRight, onClick: () => editor.rotateRight() }),
    button({ icon: "flipHorizontal", label: strings.flipHorizontal, onClick: () => editor.flipHorizontal() }),
    button({ icon: "flipVertical", label: strings.flipVertical, onClick: () => editor.flipVertical() }),
  ];
}
