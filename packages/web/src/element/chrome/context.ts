import type { Editor, EditorLayer, ImageFormat } from "@pixen/core";
import type { PixenStrings } from "../../i18n/index.js";
import type { AnnotationStyle, ToolDefinition, ToolId } from "../../tools/index.js";
import type { AspectRatioOption, PanelId } from "../constants.js";

/**
 * Everything a chrome builder is allowed to know.
 *
 * The builders are functions of this object, not methods on the element, so a
 * section of the inspector can be read, reasoned about and changed without
 * opening the custom element — and the element cannot quietly grow UI logic,
 * because it has nowhere to put it.
 */
export interface ChromeContext {
  readonly editor: Editor;
  readonly strings: PixenStrings;
  readonly tools: readonly ToolDefinition[];
  readonly ratios: readonly AspectRatioOption[];
  readonly annotationStyle: AnnotationStyle;
  readonly panel: PanelId;
  readonly tool: ToolId;
  readonly zoom: number;
  /** Whether to spell shortcuts with ⌘ or Ctrl. */
  readonly apple: boolean;
  readonly busy: boolean;
  readonly actions: ChromeActions;
}

/** What the chrome can ask the element to do. */
export interface ChromeActions {
  selectTool(tool: ToolId): void;
  togglePanel(panel: PanelId): void;
  setAnnotationStyle(patch: Partial<AnnotationStyle>): void;
  undo(): void;
  redo(): void;
  reset(): void;
  export(): void;
  zoomBy(factor: number): void;
  zoomToFit(): void;
  chooseFile(): void;
  /** Announce a change in a polite live region. */
  announce(message: string): void;
}

/** Readout nodes the element refreshes in place during a drag. */
export interface Readouts {
  zoom?: HTMLElement;
  size?: HTMLElement;
}

export interface ChromeBuild {
  nodes: Node[];
  readouts: Readouts;
}


export type { ImageFormat };
