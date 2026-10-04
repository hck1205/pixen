import {
  MAX_REDACTION_STRENGTH,
  MIN_REDACTION_STRENGTH,
  REDACTION_MODES,
  type RedactionMode,
  type RedactLayer,
} from "@pixen/core";
import type { PixenStrings } from "../../../i18n/index.js";
import { textButton } from "../../dom/index.js";
import type { ChromeContext } from "../context.js";
import { transactedSlider } from "./slider.js";
import { styleWriter } from "./style-writer.js";

/**
 * How a redaction hides its region.
 *
 * The modes are offered in order of how much they actually guarantee: `solid`
 * removes the pixels; `blur` only softens them and can be partly undone;
 * `pixelate` averages each block away but leaves the arrangement; `scramble`
 * takes the arrangement too. The wording in the UI stays plain for the same
 * reason — see docs/SECURITY.md.
 */
const MODE_STRING_KEYS = {
  solid: "redactSolid",
  blur: "redactBlur",
  pixelate: "redactPixelate",
  scramble: "redactScramble",
} as const satisfies Record<RedactionMode, keyof PixenStrings>;

/** Strength is a fraction of the longest edge, so the step is small. */
const STRENGTH_RANGE = { min: MIN_REDACTION_STRENGTH, max: MAX_REDACTION_STRENGTH, step: 0.002 };

export function buildRedactionControls(context: ChromeContext, selected: RedactLayer | null): Node[] {
  const { strings, editor } = context;
  const mode = selected?.mode ?? context.annotationStyle.redactionMode;
  const strength = selected?.strength ?? context.annotationStyle.redactionStrength;

  // The style remembers every choice, so the next redaction inherits it.
  const apply = styleWriter(context, selected);

  const nodes: Node[] = REDACTION_MODES.map((candidate) => {
    const label = strings[MODE_STRING_KEYS[candidate]];
    return textButton({
      text: label,
      active: mode === candidate,
      onClick: () => apply({ redactionMode: candidate }, { mode: candidate }),
    });
  });

  if (mode === "solid") return nodes;

  // Strength is meaningless for a solid fill, so the slider only appears with
  // the modes that have one.
  nodes.push(
    transactedSlider(editor, {
      label: strings.redactStrength,
      field: "redact-strength",
      range: STRENGTH_RANGE,
      value: strength,
      onInput: (next) => apply({ redactionStrength: next }, { strength: next }),
    }),
  );
  return nodes;
}
