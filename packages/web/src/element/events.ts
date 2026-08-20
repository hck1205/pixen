import type { Editor, EditorEvents, Unsubscribe } from "@pixen/core";

/**
 * Engine events that reach the DOM unchanged, and the name they arrive under.
 *
 * A table rather than nine `on(...)` calls: "which engine events does a host
 * see, and what are they called" is a contract, and a contract is easier to
 * keep when it is one readable object.
 *
 * `load` and `ready` are deliberately absent. Both are raised by the element
 * itself — a `pixen-load` means the picture is loaded *and* the element has
 * applied its attributes to it, which the engine cannot know.
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
} as const satisfies Partial<Record<keyof EditorEvents, `pixen-${string}`>>;

export function forwardEditorEvents(
  editor: Editor,
  emit: (type: string, detail: unknown) => void,
): Unsubscribe[] {
  return Object.entries(FORWARDED).map(([engine, dom]) =>
    // Every key of the table is a key of EditorEvents by construction, but the
    // pair loses that connection on its way through `Object.entries`.
    editor.on(engine as keyof EditorEvents, (payload) => emit(dom, payload)),
  );
}
