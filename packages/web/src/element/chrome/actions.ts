import { isPristine } from "@pixen/core";
import { button, divider, relabel, setDisabled } from "../dom/index.js";
import { redoLabel, undoLabel } from "../labels.js";
import { REDO_KEY_SHORTCUTS, UNDO_KEY_SHORTCUTS } from "../constants.js";
import type { ChromeContext } from "./context.js";

/** History and export: the actions that apply whatever tool is active. */
export function buildActions(context: ChromeContext): Node[] {
  const { strings, actions, apple } = context;

  const contributed = context.plugins.actions.map((action) =>
    button({
      ...(action.icon ? { icon: action.icon } : {}),
      label: action.label,
      ...(action.text ? { text: action.text } : {}),
      className: [action.emphasis === "primary" ? "primary" : "", action.text ? "text" : ""]
        .filter(Boolean)
        .join(" "),
      dataset: { action: `plugin:${action.id}` },
      onClick: action.onClick,
    }),
  );

  return [
    button({
      icon: "undo",
      label: undoLabel(strings, null, apple),
      keyShortcuts: UNDO_KEY_SHORTCUTS,
      dataset: { action: "undo" },
      onClick: actions.undo,
    }),
    button({
      icon: "redo",
      label: redoLabel(strings, null, apple),
      keyShortcuts: REDO_KEY_SHORTCUTS,
      dataset: { action: "redo" },
      onClick: actions.redo,
    }),
    button({ icon: "reset", label: strings.reset, dataset: { action: "reset" }, onClick: actions.reset }),
    divider(),
    button({
      icon: "download",
      label: strings.export,
      text: strings.export,
      className: "primary text",
      dataset: { action: "export" },
      onClick: actions.export,
    }),
    // Plugin actions come after Export, so a host's own button never displaces
    // the one people are looking for.
    ...(contributed.length > 0 ? [divider(), ...contributed] : []),
  ];
}

/**
 * Availability and labels, refreshed on every history change.
 *
 * Undo says what it will undo, and reset is disabled on an untouched document —
 * a disabled control is a cheaper answer than a press that does nothing.
 */
export function refreshActions(host: HTMLElement, context: ChromeContext): void {
  const { editor, strings, apple, busy } = context;
  const ready = editor.ready;
  const history = ready ? editor.historyState : null;

  setDisabled(host, "undo", !history?.canUndo);
  setDisabled(host, "redo", !history?.canRedo);
  setDisabled(host, "reset", !ready || isPristine(editor.document));
  setDisabled(host, "export", !ready || busy);

  relabel(host, "undo", undoLabel(strings, history, apple));
  relabel(host, "redo", redoLabel(strings, history, apple));

  // A plugin's own availability, asked rather than remembered, so it can depend
  // on state the plugin knows about and the chrome does not.
  for (const action of context.plugins.actions) {
    setDisabled(host, `plugin:${action.id}`, action.disabled?.() === true);
  }
}
