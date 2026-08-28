import { straightenAngleOf, toDegrees, toRadians } from "@pixen/core";
import { button, divider, optionButton } from "../../dom/index.js";
import { STRAIGHTEN_RANGE } from "../../sliders.js";
import { ratioButtonLabel, ratiosEqual } from "../../ratios.js";
import { transactedSlider } from "./slider.js";
import type { ChromeContext } from "../context.js";

/** Rounds to the step the slider actually offers, so the thumb sits on a notch. */
function toSliderDegrees(radians: number): number {
  const step = STRAIGHTEN_RANGE.step;
  return Math.round(toDegrees(radians) / step) * step;
}

/** Aspect ratios, straightening, rotation and flips — everything that shapes the crop. */
export function buildCropControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const current = editor.document.aspectRatio;

  const ratioButtons = context.ratios.map((ratio) =>
    optionButton({
      group: strings.aspectRatio,
      text: ratioButtonLabel(ratio, strings),
      active: ratiosEqual(current, ratio.value),
      onClick: () => editor.setAspectRatio(ratio.value),
    }),
  );

  // The slider shows the angle the document holds, not one the UI accumulates,
  // so it stays truthful across undo and across a quarter turn.
  const straighten = transactedSlider(editor, {
    label: strings.straighten,
    field: "straighten",
    range: STRAIGHTEN_RANGE,
    value: toSliderDegrees(straightenAngleOf(editor.document.transform.rotation)),
    onInput: (degrees) => editor.straighten(toRadians(degrees)),
  });

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
