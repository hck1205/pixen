import {
  DEFAULT_FRAME,
  FRAME_STYLES,
  MAX_FRAME_WIDTH,
  MIN_FRAME_WIDTH,
  type FrameStyle,
} from "@pixen/core";
import { button, field, input } from "../../dom/index.js";
import { transactedSlider } from "./slider.js";
import type { PixenStrings } from "../../../i18n/index.js";
import type { ChromeContext } from "../context.js";

/** One string key per style, kept exhaustive by the type rather than by memory. */
const STYLE_KEYS = {
  solid: "frameSolid",
  inset: "frameInset",
  rounded: "frameRounded",
} as const satisfies Record<FrameStyle, keyof PixenStrings>;

/** Width is a fraction of the longest edge, so the step is small. */
const FRAME_WIDTH_RANGE = { min: MIN_FRAME_WIDTH, max: MAX_FRAME_WIDTH, step: 0.002 };

/**
 * The frame: off, or one of three styles with a width and a colour.
 *
 * "None" is a button in the same row rather than a separate toggle, because
 * choosing no frame is the same kind of decision as choosing a round one.
 */
export function buildFrameControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const frame = editor.document.frame;

  const nodes: Node[] = [
    button({
      label: `${strings.frame}: ${strings.frameNone}`,
      text: strings.frameNone,
      className: "text",
      active: frame === null,
      onClick: () => editor.setFrame(null),
    }),
    ...FRAME_STYLES.map((style) =>
      button({
        label: `${strings.frame}: ${strings[STYLE_KEYS[style]]}`,
        text: strings[STYLE_KEYS[style]],
        className: "text",
        active: frame?.style === style,
        onClick: () => editor.setFrame({ style }),
      }),
    ),
  ];

  // Width and colour are meaningless with no frame, so they only appear with one.
  if (!frame) return nodes;

  nodes.push(
    transactedSlider(editor, {
      label: strings.frameWidth,
      field: "frame-width",
      range: FRAME_WIDTH_RANGE,
      value: frame.width,
      onInput: (width) => editor.setFrame({ width }),
    }),
    field(
      strings.frameColour,
      input({
        type: "color",
        value: frame.colour || DEFAULT_FRAME.colour,
        dataset: { field: "frame-colour" },
        onInput: (value) => editor.setFrame({ colour: value }),
      }),
    ),
  );
  return nodes;
}
