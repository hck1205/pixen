import type { EditorLayer, TextLayer } from "@pixen/core";
import { button, field, input } from "../../dom/index.js";
import {
  CORNER_RATIO_RANGE,
  FONT_RATIO_RANGE,
  STROKE_WIDTH_RANGE,
} from "../../constants.js";
import { TEXT_PLATE_COLOUR, type AnnotationStyle } from "../../../tools/index.js";
import type { PixenStrings } from "../../../i18n/index.js";
import type { ChromeContext } from "../context.js";
import { styleControlsFor, type StyleControl, type StyleSubject } from "./style-controls.js";
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
  const controls = styleControlsFor(subject);
  return controls.flatMap((control) => buildControl(context, control));
}

const ALIGNMENTS: ReadonlyArray<{ value: TextLayer["align"]; key: keyof PixenStrings }> = [
  { value: "left", key: "alignLeft" },
  { value: "center", key: "alignCenter" },
  { value: "right", key: "alignRight" },
];

function buildControl(context: ChromeContext, control: StyleControl): Node[] {
  const { strings, annotationStyle: style, editor } = context;
  const selected = editor.selectedLayer;
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
            onInput: (value) => {
              context.actions.setAnnotationStyle({ colour: value });
              if (selected) editor.updateLayer(selected.id, recolourPatch(selected, value));
            },
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
        button({
          label: `${strings.fillColour}: ${strings.fillNone}`,
          text: strings.fillNone,
          className: "text",
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
        button({
          label: strings.dash,
          text: strings.dash,
          className: "text",
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
            onInput: (value) => {
              const ratio = Number(value);
              context.actions.setAnnotationStyle({ cornerRatio: ratio });
              if (selected?.type === "rect") {
                const shorter = Math.min(selected.frame.width, selected.frame.height);
                editor.updateLayer(selected.id, { cornerRadius: ratio * shorter });
              }
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
              const ratio = Number(value);
              context.actions.setAnnotationStyle({ fontRatio: ratio });
              if (selected?.type === "text") {
                const longestEdge = Math.max(editor.document.source.width, editor.document.source.height);
                editor.updateLayer(selected.id, { fontSize: Math.max(8, longestEdge * ratio) });
              }
            },
          }),
        ),
      ];

    case "align":
      return ALIGNMENTS.map((alignment) =>
        button({
          label: strings[alignment.key],
          text: strings[alignment.key],
          className: "text",
          active: style.textAlign === alignment.value,
          onClick: () =>
            apply({ textAlign: alignment.value }, { align: alignment.value }),
        }),
      );

    case "textPlate":
      return [
        button({
          label: strings.textPlate,
          text: strings.textPlate,
          className: "text",
          active: style.textPlate,
          onClick: () => {
            const next = !style.textPlate;
            apply({ textPlate: next }, {
              backgroundColor: next ? TEXT_PLATE_COLOUR : null,
            });
          },
        }),
      ];

    case "arrowEnds":
      return [
        button({
          label: strings.arrowStart,
          text: strings.arrowStart,
          className: "text",
          active: style.arrowStart,
          onClick: () =>
            apply({ arrowStart: !style.arrowStart }, { arrowStart: !style.arrowStart }),
        }),
        button({
          label: strings.arrowEnd,
          text: strings.arrowEnd,
          className: "text",
          active: style.arrowEnd,
          onClick: () =>
            apply({ arrowEnd: !style.arrowEnd }, { arrowEnd: !style.arrowEnd }),
        }),
      ];
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
