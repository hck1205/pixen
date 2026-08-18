import { button, divider, field, input } from "../../dom/index.js";
import { ADJUSTMENT_RANGE, NEUTRAL_ADJUSTMENTS } from "../../constants.js";
import type { ChromeContext } from "../context.js";

type AdjustmentKey = "brightness" | "contrast" | "saturation";

/** Colour adjustment, one slider per channel. */
export function buildAdjustmentControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const values = editor.document.adjustments;

  const slider = (label: string, key: AdjustmentKey): Node =>
    field(
      label,
      input({
        type: "range",
        ...ADJUSTMENT_RANGE,
        value: String(values[key]),
        onInput: (next) => editor.setAdjustments({ [key]: Number(next) }),
        // A slider drag is one gesture, so it collapses into one undo step.
        onPointerDown: () => editor.beginTransaction(label),
        onPointerUp: () => editor.commitTransaction(),
      }),
    );

  return [
    slider(strings.brightness, "brightness"),
    slider(strings.contrast, "contrast"),
    slider(strings.saturation, "saturation"),
    divider(),
    button({
      icon: "reset",
      label: strings.reset,
      onClick: () => editor.setAdjustments({ ...NEUTRAL_ADJUSTMENTS }),
    }),
  ];
}
