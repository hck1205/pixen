import { longestEdge, type EditorLayer, type TextLayer } from "@pixen/core";
import { field, input, optionButton, textButton } from "../../dom/index.js";
import {
  CORNER_RATIO_RANGE,
  FONT_RATIO_RANGE,
  STROKE_WIDTH_RANGE,
} from "../../constants.js";
import { cornerRadiusFor, fontSizeFor, TEXT_PLATE_COLOUR } from "../../../tools/index.js";
import type { PixenStrings } from "../../../i18n/index.js";
import type { ChromeContext } from "../context.js";
import { lineEndLabel, lineEndPicker } from "./line-end-picker.js";
import { styleControlsFor, styleTarget, type StyleControl, type StyleSubject } from "./style-controls.js";
import { styleWriter } from "./style-writer.js";

/**
 * How the next annotation will look — and, when one is selected, how that one
 * looks too, since changing the colour with a shape selected obviously means
 * that shape.
 *
 * Which controls appear is decided by `styleControlsFor`; this module only
 * knows how to draw each one and where to send its value.
 */
export function buildStyleControls(context: ChromeContext, subject: StyleSubject): Node[] {
  // Not `editor.selectedLayer`: a control may only patch a layer of the kind it
  // is about. See `styleTarget`.
  const target = styleTarget(subject, context.editor.selectedLayer);
  return styleControlsFor(subject).flatMap((control) => buildControl(context, control, target));
}

const ALIGNMENTS: ReadonlyArray<{ value: TextLayer["align"]; key: keyof PixenStrings }> = [
  { value: "left", key: "alignLeft" },
  { value: "center", key: "alignCenter" },
  { value: "right", key: "alignRight" },
];

function buildControl(context: ChromeContext, control: StyleControl, selected: EditorLayer | null): Node[] {
  const { strings, annotationStyle: style, editor } = context;
  const apply = styleWriter(context, selected);

  switch (control) {
    case "colour":
      return [
        field(
          strings.strokeColour,
          input({
            type: "color",
            value: style.colour,
            dataset: { field: "colour" },
            onInput: (value) => apply({ colour: value }, selected ? recolourPatch(selected, value) : undefined),
          }),
        ),
      ];

    case "fill":
      return [
        field(
          strings.fillColour,
          input({
            type: "color",
            // A hollow shape has no colour to show, so the swatch shows the one
            // a fill would take rather than pretending to be empty.
            value: style.fill ?? style.colour,
            dataset: { field: "fill" },
            onInput: (value) => apply({ fill: value }, { fill: value }),
          }),
        ),
        optionButton({
          group: strings.fillColour,
          text: strings.fillNone,
          active: style.fill === null,
          onClick: () => apply({ fill: null }, { fill: null }),
        }),
      ];

    case "width":
      return [
        field(
          strings.strokeWidth,
          input({
            type: "range",
            ...STROKE_WIDTH_RANGE,
            value: String(style.widthRatio),
            dataset: { field: "width" },
            onInput: (value) => context.actions.setAnnotationStyle({ widthRatio: Number(value) }),
          }),
        ),
      ];

    case "dash":
      return [
        textButton({
          text: strings.dash,
          active: style.dashed,
          onClick: () => context.actions.setAnnotationStyle({ dashed: !style.dashed }),
        }),
      ];

    case "corner":
      return [
        field(
          strings.corner,
          input({
            type: "range",
            ...CORNER_RATIO_RANGE,
            value: String(style.cornerRatio),
            dataset: { field: "corner" },
            // Through the same resolver the drawing gesture uses: a rectangle
            // drawn and a rectangle edited must round by the same rule.
            onInput: (value) => {
              const cornerRatio = Number(value);
              apply(
                { cornerRatio },
                selected?.type === "rect"
                  ? { cornerRadius: cornerRadiusFor({ ...style, cornerRatio }, selected.frame) }
                  : undefined,
              );
            },
          }),
        ),
      ];

    case "fontSize":
      return [
        field(
          strings.fontSize,
          input({
            type: "range",
            ...FONT_RATIO_RANGE,
            value: String(style.fontRatio),
            dataset: { field: "font-size" },
            onInput: (value) => {
              const fontRatio = Number(value);
              apply(
                { fontRatio },
                selected?.type === "text"
                  ? { fontSize: fontSizeFor({ ...style, fontRatio }, longestEdge(editor.document.source)) }
                  : undefined,
              );
            },
          }),
        ),
      ];

    case "align":
      return ALIGNMENTS.map((alignment) =>
        textButton({
          text: strings[alignment.key],
          active: style.textAlign === alignment.value,
          onClick: () =>
            apply({ textAlign: alignment.value }, { align: alignment.value }),
        }),
      );

    case "textPlate":
      return [
        textButton({
          text: strings.textPlate,
          active: style.textPlate,
          onClick: () => {
            const next = !style.textPlate;
            apply({ textPlate: next }, {
              backgroundColor: next ? TEXT_PLATE_COLOUR : null,
            });
          },
        }),
      ];

    case "lineEnds":
      // Two rows of eight rather than one of sixteen: a person picks what goes
      // on *this* end, and the two ends are independent.
      return (["startStyle", "endStyle"] as const).map((end) =>
        field(lineEndLabel(context, end), lineEndPicker(context, end, style[end], selected)),
      );
  }
}

/**
 * Where a colour belongs on a given layer.
 *
 * The stroke, normally — the fill has its own control now, so one swatch
 * meaning two things would be a swatch nobody could predict. A shape with no
 * stroke at all is the exception: it can only have meant the fill.
 */
export function recolourPatch(layer: EditorLayer, colour: string): Partial<EditorLayer> {
  switch (layer.type) {
    // A repair has no colour of its own: it is made of the picture around it.
    case "retouch":
      return {};
    case "text":
      return { color: colour };
    case "line":
    case "path":
      return { stroke: { ...layer.stroke, color: colour } };
    case "redact":
      // The colour of a redaction is its solid fill, and its fallback.
      return { colour };
    case "image":
      // A bitmap has no colour of its own.
      return {};
    case "rect":
    case "ellipse":
      if (layer.stroke) return { stroke: { ...layer.stroke, color: colour } };
      return layer.fill ? { fill: colour } : {};
  }
}
