import {
  DEFAULT_ANNOTATION_COLOUR,
  DEFAULT_FONT_RATIO,
  DEFAULT_REDACTION_MODE,
  DEFAULT_REDACTION_STRENGTH,
  DEFAULT_STROKE_RATIO,
  type RedactionMode,
  type Stroke,
  type TextLayer,
} from "@pixen/core";

/**
 * How new annotations look, and how that scales.
 *
 * Widths and font sizes are stored as a fraction of the image's longest edge, so
 * an annotation drawn on an 800px photo and one drawn on an 8000px photo look
 * the same to the person drawing them.
 */
export interface AnnotationStyle {
  colour: string;
  /** Stroke width as a fraction of the image's longest edge, so annotations
   * look the same on a 800px and a 8000px source. */
  widthRatio: number;
  fontRatio: number;
  /** Fill for closed shapes; null draws them hollow. */
  fill: string | null;
  /** Dashes a stroke, in multiples of its own width so it scales with it. */
  dashed: boolean;
  /** Corner rounding for rectangles, as a fraction of the shorter side. */
  cornerRatio: number;
  /** Which ends of an arrow get a head. */
  arrowStart: boolean;
  arrowEnd: boolean;
  textAlign: TextLayer["align"];
  /** A plate behind text, for a caption that has to read on any photograph. */
  textPlate: boolean;
  /** How the next redaction hides its region, and how strongly. */
  redactionMode: RedactionMode;
  redactionStrength: number;
}

export const DEFAULT_STYLE: AnnotationStyle = {
  colour: DEFAULT_ANNOTATION_COLOUR,
  widthRatio: DEFAULT_STROKE_RATIO,
  fontRatio: DEFAULT_FONT_RATIO,
  fill: null,
  dashed: false,
  cornerRatio: 0,
  arrowStart: false,
  arrowEnd: true,
  textAlign: "left",
  textPlate: false,
  redactionMode: DEFAULT_REDACTION_MODE,
  redactionStrength: DEFAULT_REDACTION_STRENGTH,
};

/** Dash length and gap, in multiples of the stroke's own width. */
const DASH_PATTERN = [2.5, 2];

/** A plate is drawn at this alpha behind text, dark enough to carry white type. */
export const TEXT_PLATE_COLOUR = "rgba(18, 22, 28, 0.6)";

export function strokeFor(style: AnnotationStyle, imageLongestEdge: number): Stroke {
  const width = Math.max(1, imageLongestEdge * style.widthRatio);
  // The dash is expressed in stroke widths, so a dashed line looks the same on
  // a thumbnail and on a 6000px export.
  return {
    color: style.colour,
    width,
    ...(style.dashed ? { dash: DASH_PATTERN.map((step) => step * width) } : {}),
  };
}

/** Corner radius for a new rectangle, from the frame it was drawn at. */
export function cornerRadiusFor(style: AnnotationStyle, frame: { width: number; height: number }): number {
  return style.cornerRatio * Math.min(frame.width, frame.height);
}

/** Below this, text is drawn but cannot be read; a slider must not reach it. */
const MIN_FONT_SIZE = 8;

export function fontSizeFor(style: AnnotationStyle, imageLongestEdge: number): number {
  return Math.max(MIN_FONT_SIZE, imageLongestEdge * style.fontRatio);
}
