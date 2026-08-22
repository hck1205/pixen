/** The identifiers a host uses to choose which tools appear. */
export type ToolId =
  | "crop"
  | "select"
  | "rect"
  | "ellipse"
  | "arrow"
  | "draw"
  | "text"
  | "sticker"
  | "redact";

export interface ToolDefinition {
  id: ToolId;
  /** Tool-specific options; unknown keys are ignored so hosts can pass extras. */
  options?: Record<string, unknown>;
}

/**
 * What a host may put in `tools`.
 *
 * Three spellings, because all three read naturally and `normaliseTools`
 * accepts all three: a bare id, `{ id, options }`, or `{ type, options }` —
 * which is the one the documentation has always shown.
 */
export type ToolInput = ToolId | ToolDefinition | { type: ToolId; options?: Record<string, unknown> };

export interface CropToolOptions {
  /** Selectable ratios. `null` is the freeform entry. */
  ratios?: (number | null)[];
  /**
   * The ratio a freshly loaded picture is locked to. `null` is freeform, which
   * is also what a host that says nothing gets.
   */
  defaultRatio?: number | null;
  minSize?: number;
}

export interface StickerToolOptions {
  /** Width of a placed sticker, as a fraction of the visible crop's longest edge. */
  scale?: number;
}
