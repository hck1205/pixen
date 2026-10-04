import { isLossy, resolveOutputFormat, resolveQuality, type ImageFormat } from "@pixen/core";
import { field, input, optionButton, textButton } from "../../dom/index.js";
import { OUTPUT_QUALITY_RANGE } from "../../sliders.js";
import type { ChromeContext } from "../context.js";
import {
  MAX_OUTPUT_EDGE,
  NATURAL_SIZE,
  OUTPUT_FORMATS,
  backgroundRequired,
  formatLabel,
  isResized,
  linkTogglePatch,
  ratioLinked,
  resizePatch,
  type SizeEdge,
} from "./output-settings.js";

/**
 * What comes out of the editor: how big, in what format, and how good.
 *
 * These were settable from the host from the first version and by nobody else,
 * which made the editor a viewer of somebody else's decision. They are all
 * document state, so they undo with everything else.
 */
export function buildOutputControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const output = editor.document.output;
  const size = editor.outputSize;
  const format = resolveOutputFormat(editor.document);
  const linked = ratioLinked(output);

  const nodes: Node[] = [
    sizeField(context, "width", strings.outputWidth, size.width),
    sizeField(context, "height", strings.outputHeight, size.height),
    textButton({
      text: strings.linkRatio,
      active: linked,
      dataset: { field: "link-ratio" },
      onClick: () => editor.setOutput(linkTogglePatch(output, size)),
    }),
    textButton({
      text: strings.sizeNatural,
      disabled: !isResized(output),
      dataset: { field: "natural-size" },
      onClick: () => editor.setOutput(NATURAL_SIZE),
    }),
    // A size larger than the picture does nothing until this is on, so the
    // control belongs next to the size fields rather than in a host's config.
    textButton({
      text: strings.allowUpscale,
      active: output.upscale,
      dataset: { field: "upscale" },
      onClick: () => editor.setOutput({ upscale: !output.upscale }),
    }),
    ...OUTPUT_FORMATS.map((option) => formatButton(context, option, format)),
  ];

  // Quality is only a question for an encoder that throws information away.
  if (isLossy(format)) {
    nodes.push(
      field(
        strings.quality,
        input({
          type: "range",
          ...OUTPUT_QUALITY_RANGE,
          // The stored number, or what this format would be encoded at if the
          // slider is never touched — a slider showing nothing while the
          // exporter has an answer is the panel lying about the file.
          value: String(resolveQuality(format, output.quality)),
          dataset: { field: "quality" },
          onInput: (value) => editor.setQuality(Number(value)),
        }),
      ),
    );
  }

  nodes.push(
    field(
      strings.background,
      input({
        type: "color",
        // There is no such colour as "none", so an unset background shows the
        // one the export would fall back to rather than an empty well.
        value: output.background ?? FALLBACK_BACKGROUND,
        dataset: { field: "background" },
        onInput: (value) => editor.setOutput({ background: value }),
      }),
    ),
  );

  // A format with no alpha channel always has a background, so offering to
  // remove it would be offering something that cannot happen.
  if (!backgroundRequired(format)) {
    nodes.push(
      optionButton({
        group: strings.background,
        text: strings.backgroundNone,
        active: output.background === null,
        dataset: { field: "background-none" },
        onClick: () => editor.setOutput({ background: null }),
      }),
    );
  }

  return nodes;
}

/** What a format with no alpha channel puts behind a transparent pixel. */
const FALLBACK_BACKGROUND = "#ffffff";

/** One side of the size, as a number field that commits on every keystroke. */
function sizeField(context: ChromeContext, edge: SizeEdge, label: string, value: number): Node {
  const { editor } = context;
  return field(
    label,
    input({
      type: "number",
      min: 1,
      max: MAX_OUTPUT_EDGE,
      step: 1,
      value: String(value),
      dataset: { field: `output-${edge}` },
      onInput: (typed) => {
        const patch = resizePatch(edge, Number(typed), editor.outputSize, ratioLinked(editor.document.output));
        if (patch) editor.setOutput(patch);
      },
    }),
  );
}

function formatButton(context: ChromeContext, option: ImageFormat | null, active: ImageFormat): Node {
  const { strings, editor } = context;
  const chosen = editor.document.output.format;
  const label = option === null ? `${strings.formatAuto} (${formatLabel(active)})` : formatLabel(option);
  return textButton({
    label,
    text: option === null ? strings.formatAuto : formatLabel(option),
    active: chosen === option,
    dataset: { field: `format-${option === null ? "auto" : formatLabel(option).toLowerCase()}` },
    onClick: () => editor.setFormat(option),
  });
}
