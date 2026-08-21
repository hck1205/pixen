import { PixenError } from "../../errors/index.js";
import { err, ok, type Result } from "../../fp/result.js";
import type { EditorDocument } from "../../model/types.js";
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
} from "../history.js";
import { documentChangeFor, type DocumentChange, type Intent, type SessionEvent } from "./intents.js";

/**
 * The session machine: what happens when an intent arrives.
 *
 * History, selection and transactions live here; which command an intent
 * stands for lives in `intents.ts`. The `Editor` class above only holds the
 * current value and owns the resources, so all of this is reachable from a
 * unit test with plain objects and no DOM, canvas or bitmap.
 */
export interface SessionState {
  readonly document: EditorDocument;
  readonly selection: string | null;
  readonly history: HistoryState<EditorDocument>;
}

export interface SessionOutcome {
  readonly state: SessionState;
  readonly events: readonly SessionEvent[];
  /**
   * Whether committing a gesture actually recorded a step.
   *
   * Only `commit-transaction` sets it, and it is here because the reducer is the
   * only thing that knows. `commit` compares the document against the snapshot
   * the gesture opened with; a shell counting history entries cannot tell a
   * gesture that changed nothing from one that changed something at a history
   * that is already full and drops its oldest entry to make room.
   */
  readonly recorded?: boolean;
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

export function pruneSelection(document: EditorDocument, selection: string | null): string | null {
  if (selection === null) return null;
  return document.layers.some((layer) => layer.id === selection) ? selection : null;
}

/**
 * A history refusal, as an error a host can act on.
 *
 * Not called `toPixenError`: `errors/index.ts` exports a function by that name
 * which wraps an unknown cause, and two different meanings under one name in
 * neighbouring modules is a collision waiting for whoever imports the other.
 */
function historyError(failure: HistoryFailure): PixenError {
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

function restoreSnapshot(
  state: SessionState,
  snapshot: EditorDocument,
  reason: string,
  history: HistoryState<EditorDocument>,
): SessionOutcome {
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
      if (!opened.ok) return err(historyError(opened.error));
      return ok({
        state: { ...state, history: opened.value },
        events: [{ type: "history", summary: summarise(opened.value) }],
      });
    }

    case "commit-transaction": {
      const committed = commit(state.history, state.document);
      if (!committed.ok) return err(historyError(committed.error));
      const { state: history, recorded } = committed.value;
      const events: SessionEvent[] = [{ type: "history", summary: summarise(history) }];
      if (recorded) {
        events.push({ type: "change", document: state.document, reason: "commit", transient: false });
      }
      return ok({ state: { ...state, history }, events, recorded });
    }

    case "rollback-transaction": {
      const rolledBack = rollback(state.history);
      if (!rolledBack.ok) return err(historyError(rolledBack.error));
      return ok(
        restoreSnapshot(state, rolledBack.value.snapshot, "rollback", rolledBack.value.state),
      );
    }

    case "undo":
    case "redo": {
      const stepped = intent.kind === "undo" ? undo(state.history) : redo(state.history);
      if (!stepped.ok) return err(historyError(stepped.error));
      const { state: history, snapshot } = stepped.value;
      if (!snapshot) return ok({ state, events: [] });
      return ok(restoreSnapshot(state, snapshot, intent.kind, history));
    }

    case "add-layer": {
      // Never null: `add-layer` has a case in the table, and the table is
      // checked against the union at compile time.
      const outcome = applyDocumentChange(state, documentChangeFor(intent)!);
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
