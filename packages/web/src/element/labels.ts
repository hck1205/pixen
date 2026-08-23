import type { HistorySummary, Size } from "@pixen/core";
import { PANEL_LABEL_KEYS, TOOL_META, type PanelId } from "./constants.js";
import type { ToolId } from "../tools/index.js";
import type { PixenStrings } from "../i18n/index.js";

/**
 * Wording for the chrome, kept pure so it can be checked without a DOM.
 *
 * Labels carry real information here: an undo button that says what it will undo
 * is the difference between a guess and a decision, and the shortcut hint is how
 * anyone discovers the keyboard at all.
 */

/** True on Apple platforms, where the modifier is rendered as ⌘ rather than Ctrl. */
export function isAppleShortcutPlatform(platform: string | undefined): boolean {
  if (!platform) return false;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function modifierLabel(apple: boolean): string {
  return apple ? "⌘" : "Ctrl";
}

/**
 * A shortcut as one string: "⌘Z", or "Ctrl+Z".
 *
 * The plus is not decoration and not optional — on Apple the symbol reads as a
 * modifier by itself, and on Windows "CtrlZ" does not. Both spellings were in
 * use, so the undo button read "Undo (CtrlZ)" beside a Fit button reading
 * "Fit (Ctrl+0)".
 */
export function shortcutLabel(apple: boolean, key: string): string {
  return apple ? `${modifierLabel(apple)}${key}` : `${modifierLabel(apple)}+${key}`;
}

/** "Undo (⌘Z)", or "Undo crop (⌘Z)" once there is something named to undo. */
export function undoLabel(strings: PixenStrings, history: HistorySummary | null, apple: boolean): string {
  const shortcut = shortcutLabel(apple, "Z");
  const action = history?.canUndo ? history.undoLabel : null;
  return action ? `${strings.undo}: ${action} (${shortcut})` : `${strings.undo} (${shortcut})`;
}

export function redoLabel(strings: PixenStrings, history: HistorySummary | null, apple: boolean): string {
  const shortcut = shortcutLabel(apple, "⇧Z");
  const action = history?.canRedo ? history.redoLabel : null;
  return action ? `${strings.redo}: ${action} (${shortcut})` : `${strings.redo} (${shortcut})`;
}

/** Zoom as a percentage, rounded the way a user reads it. */
export function zoomLabel(zoom: number): string {
  if (!Number.isFinite(zoom) || zoom <= 0) return "—";
  const percent = zoom * 100;
  const rounded = percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
  return `${rounded}%`;
}

/** The output size readout: "1600 × 1067". */
export function sizeLabel(size: Size): string {
  return `${Math.round(size.width)} × ${Math.round(size.height)}`;
}

/**
 * What the panel that just opened is called.
 *
 * A decision rather than a lookup, which is why it is here: the tool panel has
 * no name of its own, so it borrows the armed tool's, and a tool with no entry
 * falls back to the crop — because the announcement is for a screen reader and
 * silence is the one answer that helps nobody.
 */
export function panelLabel(panel: PanelId, tool: ToolId, strings: PixenStrings): string {
  return strings[PANEL_LABEL_KEYS[panel] ?? TOOL_META[tool]?.key ?? "crop"];
}
