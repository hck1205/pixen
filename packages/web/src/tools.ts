import {
  DEFAULT_ANNOTATION_COLOUR,
  DEFAULT_FONT_RATIO,
  DEFAULT_STROKE_RATIO,
  type Stroke,
} from "@pixen/core";

export type ToolId = "crop" | "select" | "rect" | "ellipse" | "arrow" | "draw" | "text" | "redact";

export interface ToolDefinition {
  id: ToolId;
  /** Tool-specific options; unknown keys are ignored so hosts can pass extras. */
  options?: Record<string, unknown>;
}

export interface CropToolOptions {
  /** Selectable ratios. `null` is the freeform entry. */
  ratios?: (number | null)[];
  /** Ratio applied on load. */
  defaultRatio?: number | null;
  minSize?: number;
}

export interface AnnotationStyle {
  colour: string;
  /** Stroke width as a fraction of the image's longest edge, so annotations
   * look the same on a 800px and a 8000px source. */
  widthRatio: number;
  fontRatio: number;
}

export const DEFAULT_STYLE: AnnotationStyle = {
  colour: DEFAULT_ANNOTATION_COLOUR,
  widthRatio: DEFAULT_STROKE_RATIO,
  fontRatio: DEFAULT_FONT_RATIO,
};

export function strokeFor(style: AnnotationStyle, imageLongestEdge: number): Stroke {
  return { color: style.colour, width: Math.max(1, imageLongestEdge * style.widthRatio) };
}

export function fontSizeFor(style: AnnotationStyle, imageLongestEdge: number): number {
  return Math.max(8, imageLongestEdge * style.fontRatio);
}

export const DEFAULT_TOOLS: ToolDefinition[] = [
  { id: "crop" },
  { id: "select" },
  { id: "rect" },
  { id: "ellipse" },
  { id: "arrow" },
  { id: "draw" },
  { id: "text" },
  { id: "redact" },
];

/** Normalises the `tools` property, which hosts may pass as ids or objects. */
export function normaliseTools(input: unknown): ToolDefinition[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_TOOLS;
  const tools: ToolDefinition[] = [];
  for (const entry of input) {
    if (typeof entry === "string") {
      tools.push({ id: entry as ToolId });
    } else if (entry && typeof entry === "object" && "type" in entry) {
      const record = entry as { type: ToolId; options?: Record<string, unknown> };
      tools.push({ id: record.type, ...(record.options ? { options: record.options } : {}) });
    } else if (entry && typeof entry === "object" && "id" in entry) {
      tools.push(entry as ToolDefinition);
    }
  }
  return tools.length > 0 ? tools : DEFAULT_TOOLS;
}
