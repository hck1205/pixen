import { isPristine, type EditorDocument, type HistorySummary } from "@pixen/core";
import type { PanelId } from "../constants.js";
import type { ToolId } from "../../tools/index.js";

/**
 * What the chrome offers, as an answer rather than as a DOM mutation.
 *
 * Every other decision in the chrome is a pure function — which inspector
 * section belongs to a tool, what a keystroke means, which rows a layer list
 * has — and these two were the exception: they were computed inside the loops
 * that write `disabled` and `aria-pressed`, so "is Export disabled while an
 * export is running but no picture is open?" could only be answered by opening
 * a browser.
 *
 * The refreshers below are left writing what these return.
 */
export interface AvailabilityConditions {
  ready: boolean;
  busy: boolean;
  document: EditorDocument | null;
  history: HistorySummary | null;
  /** Each plugin action's own answer, asked rather than remembered. */
  pluginActions: ReadonlyArray<{ id: string; disabled?: () => boolean }>;
}

export interface ChromeAvailability {
  undo: boolean;
  redo: boolean;
  reset: boolean;
  export: boolean;
  /** Keyed by plugin action id. */
  plugins: Record<string, boolean>;
}

/** True in each field means *disabled*, which is what the DOM property wants. */
export function chromeAvailability(conditions: AvailabilityConditions): ChromeAvailability {
  const { ready, busy, document, history } = conditions;
  const plugins: Record<string, boolean> = {};
  for (const action of conditions.pluginActions) plugins[action.id] = action.disabled?.() === true;

  return {
    undo: !history?.canUndo,
    redo: !history?.canRedo,
    // A press that would do nothing is worse than a control that says so: an
    // untouched picture has nothing to reset to.
    reset: !ready || document === null || isPristine(document),
    export: !ready || busy,
    plugins,
  };
}

export interface RailConditions {
  ready: boolean;
  panel: PanelId;
  tool: ToolId;
}

export interface RailButtonState {
  disabled: boolean;
  pressed: boolean;
}

/**
 * A rail button's two states, for a tool and for a panel.
 *
 * A tool reads as pressed only while its own panel is showing: arming the crop
 * tool and then opening the layer list leaves neither of them the current
 * thing, and two pressed buttons would claim otherwise.
 */
export function railToolState(conditions: RailConditions, tool: string): RailButtonState {
  return {
    disabled: !conditions.ready,
    pressed: conditions.panel === "tool" && tool === conditions.tool,
  };
}

export function railPanelState(conditions: RailConditions, panel: string): RailButtonState {
  return { disabled: !conditions.ready, pressed: conditions.panel === panel };
}
