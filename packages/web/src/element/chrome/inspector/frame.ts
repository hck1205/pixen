import {
  DEFAULT_FRAME,
  FRAME_STYLES,
  MAX_FRAME_WIDTH,
  MIN_FRAME_WIDTH,
  type FrameStyle,
} from "@pixen/core";
import { field, input, optionButton } from "../../dom/index.js";
import { transactedSlider } from "./slider.js";
import type { PixenStrings } from "../../../i18n/index.js";
import type { ChromeContext } from "../context.js";

/** One string key per style, kept exhaustive by the type rather than by memory. */
const STYLE_KEYS = {
  solid: "frameSolid",
  inset: "frameInset",
  rounded: "frameRounded",
  hook: "frameHook",
  line: "frameLine",
  edge: "frameEdge",
} as const satisfies Record<FrameStyle, keyof PixenStrings>;

/**
 * Which measurements each treatment actually reads.
 *
 * A slider that changes nothing is worse than no slider: it says the setting
 * does something. Corner brackets have an arm length and a plain border does
 * not, so the panel asks this rather than showing all five to everybody.
 */
const STYLE_CONTROLS: Record<FrameStyle, ReadonlyArray<"inset" | "radius" | "offset" | "count" | "armLength">> = {
  solid: [],
  inset: ["inset"],
  rounded: ["radius"],
  hook: ["inset", "armLength"],
  line: ["inset", "offset", "count"],
  edge: ["inset", "offset"],
};

/** All of them are fractions of the longest edge, so the steps are small. */
const FRACTION_RANGE = { min: 0, max: 0.12, step: 0.002 };
const COUNT_RANGE = { min: 1, max: 5, step: 1 };

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
    optionButton({
      group: strings.frame,
      text: strings.frameNone,
      active: frame === null,
      onClick: () => editor.setFrame(null),
    }),
    ...FRAME_STYLES.map((style) =>
      optionButton({
        group: strings.frame,
        text: strings[STYLE_KEYS[style]],
        active: frame?.style === style,
        onClick: () => editor.setFrame({ style }),
      }),
    ),
  ];

  // Width and colour are meaningless with no frame, so they only appear with one.
  if (!frame) return nodes;

  const TUNING = {
    inset: { label: strings.frameInset2, field: "frame-inset", range: FRACTION_RANGE },
    radius: { label: strings.frameRounded, field: "frame-radius", range: FRACTION_RANGE },
    offset: { label: strings.frameOffset, field: "frame-offset", range: FRACTION_RANGE },
    armLength: { label: strings.frameArm, field: "frame-arm", range: FRACTION_RANGE },
    count: { label: strings.frameCount, field: "frame-count", range: COUNT_RANGE },
  } as const;

  nodes.push(
    transactedSlider(editor, {
      label: strings.frameWidth,
      field: "frame-width",
      range: FRAME_WIDTH_RANGE,
      value: frame.width,
      onInput: (width) => editor.setFrame({ width }),
    }),
    ...STYLE_CONTROLS[frame.style].map((name) =>
      transactedSlider(editor, {
        ...TUNING[name],
        value: frame[name],
        onInput: (value) => editor.setFrame({ [name]: value }),
      }),
    ),
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
