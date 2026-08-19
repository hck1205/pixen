import {
  MAX_REDACTION_STRENGTH,
  MIN_REDACTION_STRENGTH,
  REDACTION_MODES,
  type RedactionMode,
  type RedactLayer,
} from "@pixen/core";
import type { PixenStrings } from "../../../i18n/index.js";
import { button, field, input } from "../../dom/index.js";
import type { ChromeContext } from "../context.js";

/**
 * How a redaction hides its region.
 *
 * The modes are offered in order of how much they actually guarantee: `solid`
 * removes the pixels, while `blur` and `pixelate` only obscure them. The wording
 * in the UI stays plain for the same reason — see docs/SECURITY.md.
 */
const MODE_STRING_KEYS = {
  solid: "redactSolid",
  blur: "redactBlur",
  pixelate: "redactPixelate",
} as const satisfies Record<RedactionMode, keyof PixenStrings>;

/** Strength is meaningless for a solid fill, so the slider only appears with it. */
const STRENGTH_STEP = 0.002;

export function buildRedactionControls(context: ChromeContext, selected: RedactLayer | null): Node[] {
  const { strings, actions, editor } = context;
  const mode = selected?.mode ?? context.annotationStyle.redactionMode;
  const strength = selected?.strength ?? context.annotationStyle.redactionStrength;

  const setMode = (next: RedactionMode): void => {
    // The style remembers the choice, so the next redaction inherits it.
    actions.setAnnotationStyle({ redactionMode: next });
    if (selected) editor.updateLayer(selected.id, { mode: next });
  };

  const nodes: Node[] = REDACTION_MODES.map((candidate) => {
    const label = strings[MODE_STRING_KEYS[candidate]];
    return button({
      label,
      text: label,
      className: "text",
      active: mode === candidate,
      onClick: () => setMode(candidate),
    });
  });

  if (mode === "solid") return nodes;

  nodes.push(
    field(
      strings.redactStrength,
      input({
        type: "range",
        min: MIN_REDACTION_STRENGTH,
        max: MAX_REDACTION_STRENGTH,
        step: STRENGTH_STEP,
        value: String(strength),
        onInput: (value) => {
          const next = Number(value);
          actions.setAnnotationStyle({ redactionStrength: next });
          if (selected) editor.updateLayer(selected.id, { strength: next });
        },
      }),
    ),
  );
  return nodes;
}
