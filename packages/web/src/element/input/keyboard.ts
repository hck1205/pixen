import type { Point } from "@pixen/core";
import { TOOL_META } from "../tool-meta.js";
import type { ToolDefinition, ToolId } from "../../tools/index.js";

/**
 * What a keystroke means, decided as data.
 *
 * The handler used to be a ladder of ifs inside an event listener, which made
 * "what does shift+arrow do while nothing is selected" a question only a browser
 * could answer. Resolving to an action first makes every branch testable in node
 * and leaves the element with a switch over intents.
 */

/** Arrow-key nudge, as a fraction of the image width, and its shift multiplier. */
export const NUDGE_FRACTION = 1 / 500;
export const NUDGE_FAST_MULTIPLIER = 10;
export type KeyboardAction =
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "delete-selection" }
  | { kind: "clear-selection" }
  | { kind: "edit-text" }
  | { kind: "zoom-to-fit" }
  | { kind: "nudge"; direction: Point; fast: boolean }
  | { kind: "select-tool"; tool: ToolId };

export interface KeyboardCommand {
  action: KeyboardAction;
  /** False for keys the browser should still handle its own way. */
  preventDefault: boolean;
}

/** The parts of a `KeyboardEvent` this resolver reads. */
export interface KeyStroke {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

export interface KeyboardContext {
  tools: readonly ToolDefinition[];
  hasSelection: boolean;
  ready: boolean;
  /** True when the selection is a text layer, which Enter opens for editing. */
  textSelected?: boolean;
}

export const ARROW_VECTORS: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const DELETE_KEYS = ["Delete", "Backspace"];

export function resolveKeyboardAction(stroke: KeyStroke, context: KeyboardContext): KeyboardCommand | null {
  const modifier = stroke.metaKey === true || stroke.ctrlKey === true;
  const key = stroke.key;
  const lower = key.toLowerCase();

  if (modifier && lower === "z") {
    return { action: { kind: stroke.shiftKey ? "redo" : "undo" }, preventDefault: true };
  }
  // Ctrl+Y is the Windows spelling of redo.
  if (modifier && lower === "y") return { action: { kind: "redo" }, preventDefault: true };
  if (modifier && key === "0") return { action: { kind: "zoom-to-fit" }, preventDefault: true };

  if (DELETE_KEYS.includes(key)) {
    // Without a selection, backspace should still navigate or delete text.
    return context.hasSelection ? { action: { kind: "delete-selection" }, preventDefault: true } : null;
  }

  // Enter opens the selected text for editing, so the on-canvas editor is
  // reachable without a pointer.
  if (key === "Enter" && context.textSelected === true) {
    return { action: { kind: "edit-text" }, preventDefault: true };
  }

  if (key === "Escape") return { action: { kind: "clear-selection" }, preventDefault: false };

  const direction = ARROW_VECTORS[key];
  if (direction) {
    if (!context.ready || !context.hasSelection) return null;
    return {
      action: { kind: "nudge", direction, fast: stroke.shiftKey === true },
      preventDefault: true,
    };
  }

  // Only with a picture open: the rail's own buttons are disabled without one,
  // and a shortcut that arms a tool the rail says is unavailable is the two
  // disagreeing about the same thing.
  if (!modifier && context.ready) {
    const tool = context.tools.find((candidate) => TOOL_META[candidate.id]?.shortcut === lower);
    if (tool) return { action: { kind: "select-tool", tool: tool.id }, preventDefault: false };
  }

  return null;
}

/** How far one nudge moves a layer, in image pixels. */
export function nudgeDistance(imageWidth: number, fast: boolean): number {
  return imageWidth * NUDGE_FRACTION * (fast ? NUDGE_FAST_MULTIPLIER : 1);
}
