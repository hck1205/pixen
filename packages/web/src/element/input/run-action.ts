import type { Editor, EditorLayer } from "@pixen/core";
import { nudgeDistance, type KeyboardAction } from "./keyboard.js";
import type { ToolId } from "../../tools/index.js";

/**
 * Carrying out a keyboard action.
 *
 * `resolveKeyboardAction` decides *what* a keystroke means; this does it. The
 * two were one switch inside the element's listener, which made the element the
 * only place that knew Delete removes the selection — and made that fact
 * answerable only in a browser.
 *
 * Everything the actions need is a port, so a test can hand over a stub and
 * assert on what was called.
 */
export interface ActionPorts {
  readonly editor: Editor;
  undo(): void;
  redo(): void;
  zoomToFit(): void;
  selectTool(tool: ToolId): void;
  /** Opens the on-canvas editor over a text layer, inside a transaction. */
  editText(layer: EditorLayer): void;
}

export function runKeyboardAction(action: KeyboardAction, ports: ActionPorts): void {
  const { editor } = ports;
  const selected = editor.selectedLayer;

  switch (action.kind) {
    case "undo":
      return ports.undo();
    case "redo":
      return ports.redo();
    case "zoom-to-fit":
      return ports.zoomToFit();
    case "select-tool":
      return ports.selectTool(action.tool);
    case "clear-selection":
      editor.select(null);
      return;
    case "delete-selection":
      if (selected) editor.removeLayer(selected.id);
      return;
    case "edit-text":
      if (selected?.type === "text") ports.editText(selected);
      return;
    case "nudge": {
      if (!selected) return;
      // A nudge is a fraction of the image, not a screen pixel: the same
      // keystroke should move a mark the same *relative* distance whatever the
      // source resolution is.
      const step = nudgeDistance(editor.document.source.width, action.fast);
      editor.moveLayer(selected.id, { x: action.direction.x * step, y: action.direction.y * step });
      return;
    }
  }
}
