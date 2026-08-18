import { PixenError } from "../errors/index.js";
import { err, ok, type Result } from "../fp/result.js";
import type { CropHandle } from "../geometry/crop.js";
import type { Point, Rect } from "../geometry/types.js";
import type { ResizeIntent } from "../image/resize.js";
import { resolveSize } from "../image/resize.js";
import { cloneDocument, effectiveCrop } from "../model/document.js";
import type {
  Adjustments,
  EditorDocument,
  EditorLayer,
  OutputSettings,
} from "../model/types.js";
import * as commands from "./commands.js";
import {
  begin,
  commit,
  createHistory,
  describeFailure,
  record,
  redo,
  rollback,
  summarise,
  undo,
  type HistoryFailure,
  type HistoryState,
  type HistorySummary,
} from "./history.js";

/**
 * Editor state and the rules that move it, as pure data and pure functions.
 *
 * Everything an editor *decides* lives here: which command an intent maps to,
 * whether a change is transient, when history records, what happens to the
 * selection after an undo. The `Editor` class above it only holds the current
 * value, hands out events, and owns the resources — so all of this behaviour is
 * reachable from a unit test with plain objects and no DOM, canvas or bitmap.
 */
export interface SessionState {
  readonly document: EditorDocument;
  readonly selection: string | null;
  readonly history: HistoryState<EditorDocument>;
}

/**
 * Intents are data, which is what makes them easy to test, log, queue and
 * replay. The single exception is `transform`, the escape hatch a plugin needs
 * to apply a command this union does not know about.
 */
export type Intent =
  | { kind: "rotate-by"; radians: number }
  | { kind: "rotate-quarter-turns"; turns: number }
  | { kind: "flip"; axis: "x" | "y" }
  | { kind: "set-crop"; rect: Rect | null }
  | { kind: "drag-crop-handle"; handle: CropHandle; pointer: Point; minSize?: number }
  | { kind: "pan-crop"; delta: Point }
  | { kind: "set-aspect-ratio"; ratio: number | null }
  | { kind: "set-adjustments"; adjustments: Partial<Adjustments> }
  | { kind: "set-output"; output: Partial<OutputSettings> }
  | { kind: "resize"; resize: ResizeIntent }
  | { kind: "add-layer"; layer: EditorLayer; index?: number; select?: boolean }
  | { kind: "update-layer"; id: string; patch: Partial<EditorLayer> }
  | { kind: "move-layer"; id: string; delta: Point }
  | { kind: "reorder-layer"; id: string; index: number }
  | { kind: "remove-layer"; id: string }
  | { kind: "select"; id: string | null }
  | { kind: "reset" }
  | { kind: "set-document"; document: EditorDocument }
  | { kind: "transform"; reason: string; transform: (document: EditorDocument) => EditorDocument; label?: string; silent?: boolean }
  | { kind: "begin-transaction"; label: string }
  | { kind: "commit-transaction" }
  | { kind: "rollback-transaction" }
  | { kind: "undo" }
  | { kind: "redo" };

export type IntentKind = Intent["kind"];

export type SessionEvent =
  | { type: "change"; document: EditorDocument; reason: string; transient: boolean }
  | { type: "selection"; id: string | null }
  | { type: "history"; summary: HistorySummary };

export interface SessionOutcome {
  readonly state: SessionState;
  readonly events: readonly SessionEvent[];
}

export interface SessionOptions {
  historyLimit?: number;
  selection?: string | null;
}

export function createSession(document: EditorDocument, options: SessionOptions = {}): SessionState {
  return {
    document,
    selection: options.selection ?? null,
    history: createHistory<EditorDocument>(options.historyLimit),
  };
}

export function historyOf(state: SessionState): HistorySummary {
  return summarise(state.history);
}

/** A document-only change: which command runs, and how it appears in history. */
interface DocumentChange {
  reason: string;
  label: string;
  transform: (document: EditorDocument) => EditorDocument;
  /** Mid-gesture steps are not their own undo entries. */
  silent?: boolean;
}

/**
 * The intent-to-command table. Keeping it a pure lookup means "what does
 * rotate-right do" has one answer, checkable without constructing an editor.
 */
export function documentChangeFor(intent: Intent): DocumentChange | null {
  switch (intent.kind) {
    case "rotate-by":
      return { reason: "rotate", label: "Rotate", transform: (d) => commands.rotateBy(d, intent.radians) };
    case "rotate-quarter-turns":
      return {
        reason: "rotate",
        label: "Rotate",
        transform: (d) => commands.rotateQuarterTurns(d, intent.turns),
      };
    case "flip":
      return {
        reason: "flip",
        label: intent.axis === "x" ? "Flip horizontal" : "Flip vertical",
        transform: (d) => commands.flip(d, intent.axis),
      };
    case "set-crop":
      return {
        reason: "crop",
        label: intent.rect ? "Crop" : "Reset crop",
        transform: (d) => commands.setCrop(d, intent.rect),
      };
    case "drag-crop-handle":
      return {
        reason: "crop-drag",
        label: "Crop",
        transform: (d) => commands.dragCropHandle(d, intent.handle, intent.pointer, intent.minSize),
      };
    case "pan-crop":
      return { reason: "crop-pan", label: "Move crop", transform: (d) => commands.panCrop(d, intent.delta) };
    case "set-aspect-ratio":
      return {
        reason: "aspect-ratio",
        label: "Aspect ratio",
        transform: (d) => commands.setAspectRatio(d, intent.ratio),
      };
    case "set-adjustments":
      return {
        reason: "adjustments",
        label: "Adjust",
        transform: (d) => commands.setAdjustments(d, intent.adjustments),
      };
    case "set-output":
      return {
        reason: "output",
        label: "Output settings",
        transform: (d) => commands.setOutput(d, intent.output),
      };
    case "resize":
      return {
        reason: "resize",
        label: "Resize",
        transform: (d) => {
          const target = resolveSize(effectiveCrop(d), intent.resize);
          return commands.setOutput(d, { width: target.width, height: target.height });
        },
      };
    case "add-layer":
      return {
        reason: "layer-add",
        label: "Add annotation",
        transform: (d) => commands.addLayer(d, intent.layer, intent.index),
      };
    case "update-layer":
      return {
        reason: "layer-update",
        label: "Edit annotation",
        transform: (d) => commands.updateLayer(d, intent.id, intent.patch),
      };
    case "move-layer":
      return {
        reason: "layer-move",
        label: "Move annotation",
        transform: (d) => commands.moveLayerBy(d, intent.id, intent.delta),
      };
    case "reorder-layer":
      return {
        reason: "layer-reorder",
        label: "Reorder annotation",
        transform: (d) => commands.reorderLayer(d, intent.id, intent.index),
      };
    case "remove-layer":
      return {
        reason: "layer-remove",
        label: "Delete annotation",
        transform: (d) => commands.removeLayer(d, intent.id),
      };
    case "reset":
      return { reason: "reset", label: "Reset", transform: commands.resetEdits };
    case "set-document":
      return {
        reason: "set-document",
        label: "Replace document",
        transform: () => cloneDocument(intent.document),
      };
    case "transform":
      return {
        reason: intent.reason,
        label: intent.label ?? intent.reason,
        transform: intent.transform,
        ...(intent.silent === undefined ? {} : { silent: intent.silent }),
      };
    default:
      return null;
  }
}

/** Selection only survives while the layer it points at does. */
export function pruneSelection(document: EditorDocument, selection: string | null): string | null {
  if (selection === null) return null;
  return document.layers.some((layer) => layer.id === selection) ? selection : null;
}

function toPixenError(failure: HistoryFailure): PixenError {
  return new PixenError("INVALID_STATE", describeFailure(failure), { details: { ...failure } });
}

function applyDocumentChange(state: SessionState, change: DocumentChange): SessionOutcome {
  const before = state.document;
  const after = change.transform(before);
  if (after === before) return { state, events: [] };

  const transient = state.history.pending !== null;
  const shouldRecord = !transient && change.silent !== true;
  const history = shouldRecord ? record(state.history, change.label, before, after) : state.history;
  const selection = pruneSelection(after, state.selection);

  const events: SessionEvent[] = [{ type: "change", document: after, reason: change.reason, transient }];
  if (shouldRecord) events.push({ type: "history", summary: summarise(history) });
  if (selection !== state.selection) events.push({ type: "selection", id: selection });

  return { state: { document: after, selection, history }, events };
}

function restoreSnapshot(state: SessionState, snapshot: EditorDocument, reason: string, history: HistoryState<EditorDocument>): SessionOutcome {
  const selection = pruneSelection(snapshot, state.selection);
  const events: SessionEvent[] = [
    { type: "change", document: snapshot, reason, transient: false },
    { type: "history", summary: summarise(history) },
  ];
  if (selection !== state.selection) events.push({ type: "selection", id: selection });
  return { state: { document: snapshot, selection, history }, events };
}

/**
 * The whole editor, as one function. Failures that a host can act on — nesting
 * a transaction, committing without one, undoing mid-gesture — come back as
 * errors rather than exceptions.
 */
export function reduce(state: SessionState, intent: Intent): Result<SessionOutcome, PixenError> {
  switch (intent.kind) {
    case "select": {
      const id = pruneSelection(state.document, intent.id);
      if (id === state.selection) return ok({ state, events: [] });
      return ok({ state: { ...state, selection: id }, events: [{ type: "selection", id }] });
    }

    case "begin-transaction": {
      const opened = begin(state.history, intent.label, state.document);
      if (!opened.ok) return err(toPixenError(opened.error));
      return ok({
        state: { ...state, history: opened.value },
        events: [{ type: "history", summary: summarise(opened.value) }],
      });
    }

    case "commit-transaction": {
      const committed = commit(state.history, state.document);
      if (!committed.ok) return err(toPixenError(committed.error));
      const { state: history, recorded } = committed.value;
      const events: SessionEvent[] = [{ type: "history", summary: summarise(history) }];
      if (recorded) {
        events.push({ type: "change", document: state.document, reason: "commit", transient: false });
      }
      return ok({ state: { ...state, history }, events });
    }

    case "rollback-transaction": {
      const rolledBack = rollback(state.history);
      if (!rolledBack.ok) return err(toPixenError(rolledBack.error));
      return ok(
        restoreSnapshot(state, rolledBack.value.snapshot, "rollback", rolledBack.value.state),
      );
    }

    case "undo":
    case "redo": {
      const stepped = intent.kind === "undo" ? undo(state.history) : redo(state.history);
      if (!stepped.ok) return err(toPixenError(stepped.error));
      const { state: history, snapshot } = stepped.value;
      if (!snapshot) return ok({ state, events: [] });
      return ok(restoreSnapshot(state, snapshot, intent.kind, history));
    }

    case "add-layer": {
      const change = documentChangeFor(intent)!;
      const outcome = applyDocumentChange(state, change);
      if (intent.select === false || outcome.state === state) return ok(outcome);
      return ok({
        state: { ...outcome.state, selection: intent.layer.id },
        events: [...outcome.events, { type: "selection", id: intent.layer.id }],
      });
    }

    default: {
      const change = documentChangeFor(intent);
      if (!change) {
        return err(
          new PixenError("INVALID_STATE", `Unknown intent "${(intent as { kind: string }).kind}"`, {
            details: { intent },
          }),
        );
      }
      return ok(applyDocumentChange(state, change));
    }
  }
}

/** Applies a sequence of intents, stopping at the first failure. */
export function reduceAll(
  state: SessionState,
  intents: readonly Intent[],
): Result<SessionOutcome, PixenError> {
  let current = state;
  const events: SessionEvent[] = [];

  for (const intent of intents) {
    const outcome = reduce(current, intent);
    if (!outcome.ok) return outcome;
    current = outcome.value.state;
    events.push(...outcome.value.events);
  }

  return ok({ state: current, events });
}
