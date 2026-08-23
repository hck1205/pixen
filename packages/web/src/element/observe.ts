import type { Editor, EditorEvents, ProgressReport, Unsubscribe } from "@pixen/core";

/**
 * Everything the element does when the engine says something.
 *
 * Two kinds of thing, and they were interleaved in `connectedCallback`: events
 * a host listens for, which leave unchanged, and work the element has to do,
 * which is a port. Holding both here means "what reaches a host" is a table
 * one can read, and "what a change does to the chrome" is answerable without
 * a browser.
 *
 * The same shape as `applyAttribute` and `runKeyboardAction`: the decision is a
 * function over ports, and the element supplies the effects.
 */

/**
 * Engine events that reach the DOM unchanged, and the name they arrive under.
 *
 * `load` and `ready` are deliberately absent, and `change` and `error` are
 * below rather than here. A `pixen-load` means the picture is loaded *and* the
 * element has applied its attributes to it, which the engine cannot know; the
 * other two are reshaped on the way out.
 */
const FORWARDED = {
  "load-start": "pixen-load-start",
  "load-progress": "pixen-load-progress",
  "load-abort": "pixen-load-abort",
  "export-start": "pixen-export-start",
  "export-progress": "pixen-export-progress",
  "export-abort": "pixen-export-abort",
  export: "pixen-export",
  history: "pixen-history",
  preview: "pixen-preview",
} as const satisfies Partial<Record<keyof EditorEvents, `pixen-${string}`>>;

export interface ObserverPorts {
  emit(type: string, detail: unknown): void;
  /** Rebuild the chrome from the state the engine now holds. */
  refresh(): void;
  /** Update the readouts in place, leaving the chrome alone. */
  refreshReadouts(): void;
  /** The latest step report, or null when a task has just begun. */
  progress(report: ProgressReport | null): void;
  /** The picture went away, whoever let it go. */
  closed(): void;
}

export function observeEditor(editor: Editor, ports: ObserverPorts): Unsubscribe[] {
  const off: Unsubscribe[] = [];

  for (const [engine, dom] of Object.entries(FORWARDED)) {
    // Every key of the table is a key of EditorEvents by construction, but the
    // pair loses that connection on its way through `Object.entries`.
    off.push(editor.on(engine as keyof EditorEvents, (payload) => ports.emit(dom, payload)));
  }

  off.push(
    editor.on("change", (event) => {
      ports.emit("pixen-change", {
        document: event.document,
        reason: event.reason,
        transient: event.transient,
      });
      // A drag emits transient changes at pointer speed. Rebuilding the
      // inspector for each one would be wasteful and would steal focus, but the
      // readouts have to keep up — a crop with a stale size is worse than no
      // size at all.
      if (event.transient) ports.refreshReadouts();
      else ports.refresh();
    }),
    editor.on("selection", () => ports.refresh()),
    // The engine is the source of truth, so the element observes a close rather
    // than only knowing about the ones it started itself.
    editor.on("close", () => ports.closed()),
    editor.on("error", (error) => ports.emit("pixen-error", { error })),
    // A task's start resets the reading; nothing has been measured yet.
    editor.on("load-start", () => ports.progress(null)),
    editor.on("export-start", () => ports.progress(null)),
    editor.on("load-progress", (report) => ports.progress(report)),
    editor.on("export-progress", (report) => ports.progress(report)),
  );

  return off;
}
