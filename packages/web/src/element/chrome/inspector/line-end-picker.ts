/**
 * The eight buttons for one end of a line.
 *
 * Its own module because it is its own vocabulary: a glyph and a word for each
 * of eight decorations, and the rule about which is which. `style.ts` next door
 * knows how to draw a control and where to send its value; it does not need to
 * hold two tables and a mapping to do that for one of them.
 */
import { LINE_ENDS, type EditorLayer, type LineEnd } from "@pixen/core";
import { textButton } from "../../dom/index.js";
import type { PixenStrings } from "../../../i18n/index.js";
import type { ChromeContext } from "../context.js";
import { styleWriter } from "./style-writer.js";

/** Which end a picker is for, and the string that names it. */
const END_FIELDS = { startStyle: "lineStart", endStyle: "lineEnd" } as const;

export type LineEndField = keyof typeof END_FIELDS;

/**
 * A decoration drawn as a mark rather than translated.
 *
 * An arrow is an arrow in every language, and the eight are easier to tell
 * apart as marks than as words: "open square" and "solid square" read as the
 * same button until you look twice. The word is still the accessible name,
 * because a screen reader cannot see the mark.
 */
const END_GLYPHS: Readonly<Record<LineEnd, string>> = {
  none: "—",
  bar: "⊢",
  arrow: "→",
  "arrow-solid": "➤",
  circle: "○",
  "circle-solid": "●",
  square: "□",
  "square-solid": "■",
};

/** The word for each, which is what the mark is announced as. */
const END_NAMES: Readonly<Record<LineEnd, keyof PixenStrings>> = {
  none: "endNone",
  bar: "endBar",
  arrow: "endArrow",
  "arrow-solid": "endArrowSolid",
  circle: "endCircle",
  "circle-solid": "endCircleSolid",
  square: "endSquare",
  "square-solid": "endSquareSolid",
};

export function lineEndPicker(
  context: ChromeContext,
  field: LineEndField,
  current: LineEnd,
  selected: EditorLayer | null,
): Node {
  const group = context.strings[END_FIELDS[field]];
  const apply = styleWriter(context, selected);

  const row = document.createElement("div");
  row.className = "cluster";
  row.append(
    ...LINE_ENDS.map((end) =>
      textButton({
        text: END_GLYPHS[end],
        label: `${group}: ${context.strings[END_NAMES[end]]}`,
        active: current === end,
        dataset: { field, end },
        onClick: () => apply({ [field]: end }, { [field]: end }),
      }),
    ),
  );
  return row;
}

/** What the row is labelled, for the field that wraps it. */
export function lineEndLabel(context: ChromeContext, field: LineEndField): string {
  return context.strings[END_FIELDS[field]];
}
