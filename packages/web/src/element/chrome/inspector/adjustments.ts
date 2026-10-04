import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_PRESETS,
  ADJUSTMENT_RANGES,
  DEFAULT_ADJUSTMENTS,
  matchingPreset,
  presetAdjustments,
  type AdjustmentKey,
  type AdjustmentPreset,
} from "@pixen/core";
import { button, divider, textButton } from "../../dom/index.js";
import { transactedSlider } from "./slider.js";
import type { PixenStrings } from "../../../i18n/index.js";
import type { ChromeContext } from "../context.js";

/**
 * The label for each adjustment.
 *
 * Written out rather than derived from the key so the strings stay greppable
 * and a translator sees every one of them; the `satisfies` keeps it exhaustive
 * as the vocabulary grows.
 */
const LABEL_KEYS = {
  exposure: "exposure",
  brightness: "brightness",
  contrast: "contrast",
  saturation: "saturation",
  hue: "hue",
  grayscale: "grayscale",
  sepia: "sepia",
  invert: "invert",
  vignette: "vignette",
  gamma: "gamma",
  temperature: "temperature",
  tint: "tint",
} as const satisfies Record<AdjustmentKey, keyof PixenStrings>;

/** Colour adjustment: the preset row, then one slider per adjustment. */
export function buildAdjustmentControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const values = editor.document.adjustments;
  const active = matchingPreset(values);

  const applyPreset = (preset: AdjustmentPreset): void => {
    // A preset writes the same fields a slider does, so it is one undo step and
    // stays editable afterwards rather than being a mode to leave.
    editor.setAdjustments(presetAdjustments(preset));
  };

  const presets = ADJUSTMENT_PRESETS.map((preset) =>
    textButton({
      text: preset.label,
      active: active?.id === preset.id,
      onClick: () => applyPreset(preset),
    }),
  );

  const slider = (key: AdjustmentKey): Node =>
    transactedSlider(editor, {
      label: strings[LABEL_KEYS[key]],
      field: key,
      range: ADJUSTMENT_RANGES[key],
      value: values[key],
      onInput: (next) => editor.setAdjustments({ [key]: next }),
    });

  return [
    ...presets,
    divider(),
    ...ADJUSTMENT_KEYS.map(slider),
    divider(),
    button({
      icon: "reset",
      label: strings.reset,
      onClick: () => editor.setAdjustments({ ...DEFAULT_ADJUSTMENTS }),
    }),
  ];
}
