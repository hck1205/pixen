/** The identifiers a host uses to choose which tools appear. */
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
