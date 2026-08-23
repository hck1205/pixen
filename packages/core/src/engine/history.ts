import { last } from "../fp/function.js";
import { isStepName, STEP_LABELS, type StepName } from "./session/steps.js";
import { err, ok, type Result } from "../fp/result.js";

/**
 * Undo history as an immutable value.
 *
 * Nothing here mutates, allocates, or knows what a document is: it is a stack
 * pair plus an optional open transaction, parameterised over the snapshot type.
 * The editor keeps one of these in a field and replaces it; every transition
 * below is a pure function you can call from a test with a plain object.
 *
 * Snapshots — rather than inverse commands — are affordable because documents
 * hold no pixels: a snapshot is a small JSON object while bitmaps stay in the
 * resource manager.
 */
/**
 * One undoable step.
 *
 * `label` is what it is called in English; `step` is what it *is*, for anything
 * that can word it in the reader's own language. A step a host opened itself
 * has a label and no name, because the wording is theirs.
 */
export interface HistoryEntry<T> {
  readonly label: string;
  readonly step: StepName | null;
  readonly before: T;
  readonly after: T;
}

export interface PendingTransaction<T> {
  readonly label: string;
  readonly step: StepName | null;
  readonly before: T;
}

/**
 * How a step is asked for: one of the engine's own names, or a host's wording.
 *
 * One argument for both, because the two never need telling apart at the call
 * site: a name is looked up and becomes translatable, and anything else is used
 * exactly as given. Translating a host's own wording is not ours to do.
 *
 * The union is written this way so an editor still suggests the step names
 * while accepting any string, and so widening it never broke a caller passing
 * a label — every one of them still type-checks and still means what it did.
 */
export type StepLabel = StepName | (string & {});

function resolveStep(named: StepLabel): { label: string; step: StepName | null } {
  return isStepName(named) ? { label: STEP_LABELS[named], step: named } : { label: named, step: null };
}

export interface HistoryState<T> {
  readonly past: readonly HistoryEntry<T>[];
  readonly future: readonly HistoryEntry<T>[];
  /** The gesture in progress, if any. */
  readonly pending: PendingTransaction<T> | null;
  readonly limit: number;
}

/** What the UI needs to render undo/redo affordances. */
export interface HistorySummary {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** The same two steps by name, for a host that translates them. */
  undoStep: StepName | null;
  redoStep: StepName | null;
  depth: number;
  inTransaction: boolean;
}

export type HistoryFailure =
  | { kind: "transaction-already-open"; openLabel: string; requestedLabel: string }
  | { kind: "no-open-transaction"; operation: "commit" | "rollback" }
  | { kind: "transaction-open"; operation: "undo" | "redo"; openLabel: string };

export const DEFAULT_HISTORY_LIMIT = 100;

export function createHistory<T>(limit: number = DEFAULT_HISTORY_LIMIT): HistoryState<T> {
  return { past: [], future: [], pending: null, limit: Math.max(1, Math.floor(limit)) };
}

export function summarise<T>(state: HistoryState<T>): HistorySummary {
  return {
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoLabel: last(state.past)?.label ?? null,
    redoLabel: last(state.future)?.label ?? null,
    undoStep: last(state.past)?.step ?? null,
    redoStep: last(state.future)?.step ?? null,
    depth: state.past.length,
    inTransaction: state.pending !== null,
  };
}

/** Drops the oldest entries once the stack passes its limit. */
function pushEntry<T>(state: HistoryState<T>, entry: HistoryEntry<T>): HistoryState<T> {
  const past = [...state.past, entry];
  return {
    ...state,
    past: past.length > state.limit ? past.slice(past.length - state.limit) : past,
    future: [],
  };
}

/**
 * Records an already-applied atomic change. While a transaction is open this is
 * a no-op: the gesture as a whole is what will be recorded, not its frames.
 */
export function record<T>(
  state: HistoryState<T>,
  named: StepLabel,
  before: T,
  after: T,
): HistoryState<T> {
  if (state.pending) return state;
  return pushEntry(state, { ...resolveStep(named), before, after });
}

export function begin<T>(
  state: HistoryState<T>,
  named: StepLabel,
  snapshot: T,
): Result<HistoryState<T>, HistoryFailure> {
  const opening = resolveStep(named);
  if (state.pending) {
    return err({
      kind: "transaction-already-open",
      openLabel: state.pending.label,
      requestedLabel: opening.label,
    });
  }
  return ok({ ...state, pending: { ...opening, before: snapshot } });
}

export type Equals<T> = (a: T, b: T) => boolean;

/** Snapshots are plain JSON by contract, so structural comparison is exact. */
export const jsonEquals: Equals<unknown> = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Closes the open transaction. A gesture that ended where it started records
 * nothing, so a click that does not move never costs an undo step.
 */
export function commit<T>(
  state: HistoryState<T>,
  snapshot: T,
  equals: Equals<T> = jsonEquals,
): Result<{ state: HistoryState<T>; recorded: boolean }, HistoryFailure> {
  const pending = state.pending;
  if (!pending) return err({ kind: "no-open-transaction", operation: "commit" });

  const closed: HistoryState<T> = { ...state, pending: null };
  if (equals(pending.before, snapshot)) return ok({ state: closed, recorded: false });

  return ok({
    state: pushEntry(closed, {
      label: pending.label,
      step: pending.step,
      before: pending.before,
      after: snapshot,
    }),
    recorded: true,
  });
}

/** Abandons the gesture, handing back the state to restore. */
export function rollback<T>(
  state: HistoryState<T>,
): Result<{ state: HistoryState<T>; snapshot: T }, HistoryFailure> {
  const pending = state.pending;
  if (!pending) return err({ kind: "no-open-transaction", operation: "rollback" });
  return ok({ state: { ...state, pending: null }, snapshot: pending.before });
}

/** `snapshot` is null when there was nothing to undo. */
export function undo<T>(
  state: HistoryState<T>,
): Result<{ state: HistoryState<T>; snapshot: T | null }, HistoryFailure> {
  if (state.pending) {
    return err({ kind: "transaction-open", operation: "undo", openLabel: state.pending.label });
  }
  const entry = last(state.past);
  if (!entry) return ok({ state, snapshot: null });

  return ok({
    state: { ...state, past: state.past.slice(0, -1), future: [...state.future, entry] },
    snapshot: entry.before,
  });
}

export function redo<T>(
  state: HistoryState<T>,
): Result<{ state: HistoryState<T>; snapshot: T | null }, HistoryFailure> {
  if (state.pending) {
    return err({ kind: "transaction-open", operation: "redo", openLabel: state.pending.label });
  }
  const entry = last(state.future);
  if (!entry) return ok({ state, snapshot: null });

  return ok({
    state: { ...state, past: [...state.past, entry], future: state.future.slice(0, -1) },
    snapshot: entry.after,
  });
}


export function describeFailure(failure: HistoryFailure): string {
  switch (failure.kind) {
    case "transaction-already-open":
      return `A transaction ("${failure.openLabel}") is already open, so "${failure.requestedLabel}" cannot start`;
    case "no-open-transaction":
      return `${failure.operation}() was called without an open transaction`;
    case "transaction-open":
      return `Cannot ${failure.operation} while the transaction "${failure.openLabel}" is open`;
  }
}
