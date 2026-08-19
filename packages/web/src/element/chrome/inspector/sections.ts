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
  | "layers"
  | "output"
  | "redaction"
  | "select-hint"
  | "sticker"
  | "text-hint"
  | "style";

export interface InspectorConditions {
  panel: PanelId;
  tool: ToolId;
  hasSelection: boolean;
  /** True when the selected layer is a redaction, which has its own controls. */
  redactionSelected?: boolean;
}

export function inspectorSectionFor({
  panel,
  tool,
  hasSelection,
  redactionSelected = false,
}: InspectorConditions): InspectorSection {
  if (panel === "adjust") return "adjustments";
  // The layer list is a panel of its own: it is about the picture as a whole,
  // not about whichever tool happens to be armed.
  if (panel === "layers") return "layers";
  // So is the output: what comes out of the editor is not what is armed in it.
  if (panel === "output") return "output";
  // A selected redaction is edited wherever it was selected from.
  if (redactionSelected) return "redaction";

  switch (tool) {
    case "crop":
      return "crop";
    case "select":
      return hasSelection ? "layer" : "select-hint";
    case "text":
      return "text-hint";
    case "sticker":
      return "sticker";
    case "redact":
      return "redaction";
    default:
      return "style";
  }
}

