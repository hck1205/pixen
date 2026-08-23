import { AVERAGE_GLYPH_RATIO, LINE_HEIGHT_RATIO } from "./text-metrics.js";
import type { TextLayer } from "./types.js";

/**
 * How much room a caption takes: wrapping, and the box the lines occupy.
 *
 * This lives in the model rather than the renderer because two very different
 * callers need the same answer. The renderer needs it to draw the letters and
 * the plate behind them; the editor needs it for the selection box, the
 * handles, the hit test and the centre a rotation turns about. They used to
 * measure separately, and a caption's box did not fit its own letters.
 *
 * Measuring needs a canvas, which the model does not have, so it is injected —
 * and the estimate below is what stands in where there is none.
 */

/** Measures a string in a given CSS font. Injected so text layout is testable. */
export type TextMeasurer = (text: string, font: string) => number;

/** The font size a measurer falls back to when a font string carries none. */
const FALLBACK_FONT_SIZE = 16;

/**
 * Rough fallback: enough for layout when no real measurer is available.
 *
 * A single ratio is wrong for every particular string in a proportional font —
 * `iiii` and `WWWW` are the same width to it and four times apart on screen —
 * so anything that can reach a canvas should measure instead of using this.
 */
export const estimateTextWidth: TextMeasurer = (text, font) => {
  const size = Number.parseFloat(font) || FALLBACK_FONT_SIZE;
  return text.length * size * AVERAGE_GLYPH_RATIO;
};

/** The CSS `font` shorthand a layer draws with. Its block carries it onward. */
function fontFor(layer: TextLayer): string {
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

/** A caption laid out: the lines, and the box they occupy in image space. */
export interface TextBlock {
  readonly font: string;
  readonly lines: string[];
  readonly lineHeight: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Measured once, used by everything that needs the box — the plate behind the
 * letters, the anchor an alignment moves, the layer's bounds, the centre a
 * rotation turns about.
 */
export function textBlock(layer: TextLayer, measure: TextMeasurer): TextBlock {
  const font = fontFor(layer);
  const lines = wrapLines(layer.text, layer.maxWidth, font, measure);
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO;
  return {
    font,
    lines,
    lineHeight,
    width: lines.reduce((widest, line) => Math.max(widest, measure(line, font)), 0),
    height: lines.length * lineHeight,
  };
}
