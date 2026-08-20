import type {
  AbortReason,
  Editor,
  EditorDocument,
  ExportResult,
  HistorySummary,
  ImageFormat,
  PixenError,
  ProgressReport,
} from "@pixen/core";
import type { PixenImageEditorElement } from "../element/index.js";

/**
 * The element's events, in one place.
 *
 * Every framework wrapper needs the same list and the same detail shapes, and
 * each copy of that list is a chance for one wrapper to forget an event. The
 * wrappers subscribe through here instead, so adding an event means adding it
 * once.
 */
export const PIXEN_EVENTS = [
  "ready",
  "load-start",
  "load-progress",
  "load-abort",
  "load",
  "change",
  "history",
  "export-start",
  "export-progress",
  "export-abort",
  "export",
  "error",
] as const;

export type PixenEventName = (typeof PIXEN_EVENTS)[number];

export interface PixenEventDetail {
  ready: { editor: Editor };
  /** `replace` is true for `replaceSource`: the edit survives, the pixels do not. */
  "load-start": { replace: boolean };
  "load-progress": ProgressReport;
  "load-abort": { reason: AbortReason };
  load: { document: EditorDocument };
  change: { document: EditorDocument; reason: string; transient: boolean };
  history: HistorySummary;
  "export-start": { format: ImageFormat };
  "export-progress": ProgressReport;
  "export-abort": { reason: AbortReason };
  export: ExportResult;
  error: { error: PixenError };
}

/** DOM event types are namespaced; the wrappers expose the bare names. */
export function eventTypeFor(name: PixenEventName): `pixen-${PixenEventName}` {
  return `pixen-${name}`;
}

export type PixenEventHandlers = {
  [K in PixenEventName]?: (detail: PixenEventDetail[K]) => void;
};

/**
 * Subscribes to every handler given, and returns one function that unsubscribes
 * them all — the shape both `useEffect` and `onBeforeUnmount` want.
 */
export function attachEvents(
  element: PixenImageEditorElement,
  handlers: PixenEventHandlers,
): () => void {
  const listeners: Array<[string, EventListener]> = [];

  for (const name of PIXEN_EVENTS) {
    const handler = handlers[name];
    if (!handler) continue;
    const type = eventTypeFor(name);
    const listener = ((event: CustomEvent) => {
      (handler as (detail: unknown) => void)(event.detail);
    }) as EventListener;
    element.addEventListener(type, listener);
    listeners.push([type, listener]);
  }

  return () => {
    for (const [type, listener] of listeners) element.removeEventListener(type, listener);
  };
}
