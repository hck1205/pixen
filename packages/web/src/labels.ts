import type { HistorySummary, Size } from "@pixen/core";
import type { PixenStrings } from "./i18n.js";

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

/** "Undo (⌘Z)", or "Undo crop (⌘Z)" once there is something named to undo. */
export function undoLabel(strings: PixenStrings, history: HistorySummary | null, apple: boolean): string {
  const shortcut = `${modifierLabel(apple)}Z`;
  const action = history?.canUndo ? history.undoLabel : null;
  return action ? `${strings.undo}: ${action} (${shortcut})` : `${strings.undo} (${shortcut})`;
}

export function redoLabel(strings: PixenStrings, history: HistorySummary | null, apple: boolean): string {
  const shortcut = `${modifierLabel(apple)}⇧Z`;
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

/** What the status region announces when the active tool changes. */
export function toolAnnouncement(strings: PixenStrings, tool: keyof PixenStrings): string {
  return `${strings[tool]}`;
}
