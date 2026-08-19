import type { PanelId } from "../../constants.js";
import type { ToolId } from "../../../tools/index.js";

/**
 * Which inspector section belongs to which tool.
 *
 * A pure lookup, so "what does the inspector show for the text tool with nothing
 * selected" is answerable without a browser — and adding a tool means adding a
 * case here rather than editing a switch buried in a DOM builder.
 */
export type InspectorSection =
  | "adjustments"
  | "crop"
  | "layer"
  | "select-hint"
  | "text-hint"
  | "redact-hint"
  | "style";

export interface InspectorConditions {
  panel: PanelId;
  tool: ToolId;
  hasSelection: boolean;
}

export function inspectorSectionFor({ panel, tool, hasSelection }: InspectorConditions): InspectorSection {
  if (panel === "adjust") return "adjustments";

  switch (tool) {
    case "crop":
      return "crop";
    case "select":
      return hasSelection ? "layer" : "select-hint";
    case "text":
      return "text-hint";
    case "redact":
      return "redact-hint";
    default:
      return "style";
  }
}

