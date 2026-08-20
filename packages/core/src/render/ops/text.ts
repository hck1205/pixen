import { AVERAGE_GLYPH_RATIO } from "../../model/text-metrics.js";
import type { TextLayer } from "../../model/types.js";
import type { TextMeasurer } from "./types.js";

/**
 * Laying text out before anything draws it.
 *
 * Wrapping is a decision — which words land on which line — so it happens here,
 * over an injected measurer, rather than inside a canvas call where no test can
 * see it. The renderer and the export share this, which is why a wrapped
 * caption cannot come out differently in the two.
 */
/** The font size a measurer falls back to when a font string carries none. */
const FALLBACK_FONT_SIZE = 16;

/** Rough fallback: enough for layout when no real measurer is available. */
export const estimateTextWidth: TextMeasurer = (text, font) => {
  const size = Number.parseFloat(font) || FALLBACK_FONT_SIZE;
  return text.length * size * AVERAGE_GLYPH_RATIO;
};

export function fontFor(layer: TextLayer): string {
  return `${layer.fontSize}px ${layer.fontFamily}`;
}

/** Greedy word wrap. Explicit newlines always break; `maxWidth` is optional. */
export function wrapLines(
  text: string,
  maxWidth: number | null,
  font: string,
  measure: TextMeasurer,
): string[] {
  const paragraphs = text.split("\n");
  if (maxWidth == null) return paragraphs;

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word;
      if (line && measure(candidate, font) > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}
