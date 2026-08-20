import type { PixenError } from "../errors/index.js";
import type { ExportResult } from "../export/pipeline.js";
import type { EditorDocument, ImageFormat } from "../model/types.js";
import type { ImageResource } from "../resources/manager.js";
import type { HistorySummary } from "./history.js";
import type { SessionEvent } from "./session/index.js";
import type { AbortReason, ProgressReport } from "./tasks/index.js";

/**
 * Everything the editor announces, and the shape it announces it in.
 *
 * The contract hosts write against, so it lives apart from the class that
 * happens to raise it: reading "what can I listen for" should not mean reading
 * an imperative shell.
 */
export interface EditorEvents {
  /**
   * A load has begun. `replace` distinguishes `replaceSource` from `load`: one
   * keeps the edit and swaps the pixels, the other starts over.
   *
   * Paired with exactly one of `load`, `load-abort` or `error`, so an interface
   * can turn a busy state on here and be certain something turns it off.
   */
  "load-start": { replace: boolean };
  "load-progress": ProgressReport;
  /** The load was called off rather than failing. See `AbortReason`. */
  "load-abort": { reason: AbortReason };
  load: { document: EditorDocument; resource: ImageResource };
  change: { document: EditorDocument; reason: string; transient: boolean };
  history: HistorySummary;
  selection: { id: string | null };
  /** An export has begun, in the format it will actually produce. */
  "export-start": { format: ImageFormat };
  "export-progress": ProgressReport;
  /** The export was called off rather than failing. See `AbortReason`. */
  "export-abort": { reason: AbortReason };
  export: ExportResult;
  error: PixenError;
  /** The image was closed; the editor is back to holding nothing. */
  close: void;
  destroy: void;
}

/** One event, packed with its payload so a translation can return a list. */
export type EditorEmission = {
  [K in keyof EditorEvents]: { type: K; payload: EditorEvents[K] };
}[keyof EditorEvents];

/**
 * Session events, translated into the vocabulary hosts subscribe to.
 *
 * A pure function rather than a loop of `emit` calls: "a commit produces a
 * change and a history event" is then answerable in a unit test, without an
 * editor, a document or a decoded image.
 */
export function editorEmissions(events: readonly SessionEvent[]): EditorEmission[] {
  const emissions: EditorEmission[] = [];
  for (const event of events) {
    switch (event.type) {
      case "change":
        emissions.push({
          type: "change",
          payload: { document: event.document, reason: event.reason, transient: event.transient },
        });
        break;
      case "history":
        emissions.push({ type: "history", payload: event.summary });
        break;
      case "selection":
        emissions.push({ type: "selection", payload: { id: event.id } });
        break;
    }
  }
  return emissions;
}
