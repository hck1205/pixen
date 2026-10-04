import { describe, expect, it } from "vitest";
import {
  begin,
  commit,
  createHistory,
  describeFailure,
  isErr,
  jsonEquals,
  record,
  redo,
  rollback,
  STEP_LABELS,
  summarise,
  undo,
  type HistoryState,
} from "@pixen/core";

/** Snapshots here are plain strings: history does not care what it stores. */
type State = HistoryState<string>;

const fresh = (limit?: number): State => createHistory<string>(limit);

/** Records a change and returns the new history, for readable chains. */
const after = (state: State, label: string, before: string, next: string): State =>
  record(state, label, before, next);

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("createHistory", () => {
  it("starts empty", () => {
    expect(summarise(fresh())).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      undoStep: null,
      redoStep: null,
      depth: 0,
      inTransaction: false,
    });
  });

  it("never accepts a limit below one", () => {
    expect(createHistory<string>(0).limit).toBe(1);
    expect(createHistory<string>(-5).limit).toBe(1);
  });

  it("floors a fractional limit", () => {
    expect(createHistory<string>(3.7).limit).toBe(3);
  });
});

describe("record", () => {
  it("is pure: the input state is untouched", () => {
    const initial = fresh();
    const next = after(initial, "Crop", "a", "b");
    expect(initial.past).toHaveLength(0);
    expect(next.past).toHaveLength(1);
  });

  it("clears the redo stack once a new change lands", () => {
    let state = after(fresh(), "a", "0", "1");
    state = unwrap(undo(state)).state;
    expect(summarise(state).canRedo).toBe(true);

    state = after(state, "b", "0", "2");
    expect(summarise(state).canRedo).toBe(false);
  });

  it("drops the oldest entry past its limit", () => {
    let state = fresh(2);
    state = after(state, "a", "0", "1");
    state = after(state, "b", "1", "2");
    state = after(state, "c", "2", "3");

    expect(summarise(state).depth).toBe(2);
    expect(state.past.map((entry) => entry.label)).toEqual(["b", "c"]);
  });

  it("is ignored while a transaction is open", () => {
    const open = unwrap(begin(fresh(), "Drag", "0"));
    const state = after(open, "noise", "0", "1");
    expect(summarise(state).depth).toBe(0);
  });
});

describe("undo and redo", () => {
  it("walks back and forward through snapshots", () => {
    let state = after(fresh(), "Crop", "before", "after");

    const undone = unwrap(undo(state));
    expect(undone.snapshot).toBe("before");
    state = undone.state;
    expect(summarise(state).canRedo).toBe(true);

    const redone = unwrap(redo(state));
    expect(redone.snapshot).toBe("after");
    expect(summarise(redone.state).canUndo).toBe(true);
  });

  it("reports nothing to do on an empty stack", () => {
    expect(unwrap(undo(fresh())).snapshot).toBeNull();
    expect(unwrap(redo(fresh())).snapshot).toBeNull();
  });

  it("leaves the state alone when there is nothing to do", () => {
    const state = fresh();
    expect(unwrap(undo(state)).state).toBe(state);
  });

  it("refuses to move mid-gesture", () => {
    const open = unwrap(begin(after(fresh(), "a", "0", "1"), "Drag", "1"));
    const result = undo(open);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({ kind: "transaction-open", operation: "undo", openLabel: "Drag" });
    }
  });

  it("survives a full round trip over several entries", () => {
    let state = fresh();
    state = after(state, "a", "0", "1");
    state = after(state, "b", "1", "2");
    state = after(state, "c", "2", "3");

    const first = unwrap(undo(state));
    const second = unwrap(undo(first.state));
    expect(second.snapshot).toBe("1");

    const forward = unwrap(redo(second.state));
    expect(forward.snapshot).toBe("2");
    expect(summarise(forward.state).depth).toBe(2);
  });
});

describe("transactions", () => {
  it("collapses a whole gesture into one step", () => {
    let state = unwrap(begin(fresh(), "Drag crop", "0"));
    state = after(state, "noise", "0", "1");
    state = after(state, "noise", "1", "2");
    expect(summarise(state).depth).toBe(0);

    const committed = unwrap(commit(state, "3"));
    expect(committed.recorded).toBe(true);
    expect(summarise(committed.state).depth).toBe(1);
    expect(unwrap(undo(committed.state)).snapshot).toBe("0");
  });

  it("records nothing when a gesture ends where it started", () => {
    const open = unwrap(begin(fresh(), "Drag", "same"));
    const committed = unwrap(commit(open, "same"));
    expect(committed.recorded).toBe(false);
    expect(summarise(committed.state).canUndo).toBe(false);
  });

  it("compares snapshots structurally, not by reference", () => {
    const open = begin(createHistory<{ x: number }>(), "Drag", { x: 1 });
    const committed = unwrap(commit(unwrap(open), { x: 1 }));
    expect(committed.recorded).toBe(false);
  });

  it("accepts a custom comparator", () => {
    const open = unwrap(begin(createHistory<string>(), "Drag", "a"));
    const committed = unwrap(commit(open, "A", (a, b) => a.toLowerCase() === b.toLowerCase()));
    expect(committed.recorded).toBe(false);
  });

  it("hands back the pre-gesture snapshot on rollback", () => {
    const open = unwrap(begin(fresh(), "Drag", "before"));
    const rolledBack = unwrap(rollback(open));
    expect(rolledBack.snapshot).toBe("before");
    expect(summarise(rolledBack.state).inTransaction).toBe(false);
  });

  it("refuses nested transactions", () => {
    const open = unwrap(begin(fresh(), "first", "0"));
    const result = begin(open, "second", "0");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("transaction-already-open");
  });

  it("refuses to commit or roll back without an open transaction", () => {
    expect(isErr(commit(fresh(), "x"))).toBe(true);
    expect(isErr(rollback(fresh()))).toBe(true);
  });

  it("keeps the redo stack cleared after a committed gesture", () => {
    let state = after(fresh(), "a", "0", "1");
    state = unwrap(undo(state)).state;
    state = unwrap(begin(state, "Drag", "0"));
    state = unwrap(commit(state, "9")).state;
    expect(summarise(state).canRedo).toBe(false);
  });
});

describe("summarise", () => {
  it("labels the next undo and redo for the UI", () => {
    let state = after(fresh(), "Crop", "0", "1");
    expect(summarise(state).undoLabel).toBe("Crop");

    state = unwrap(undo(state)).state;
    expect(summarise(state).redoLabel).toBe("Crop");
    expect(summarise(state).undoLabel).toBeNull();
  });

  it("reports an open gesture", () => {
    expect(summarise(unwrap(begin(fresh(), "Drag", "0"))).inTransaction).toBe(true);
  });
});

describe("failure messages", () => {
  it("explains each failure in terms a host can show", () => {
    expect(describeFailure({ kind: "transaction-already-open", openLabel: "Drag", requestedLabel: "Crop" })).toMatch(
      /already open/,
    );
    expect(describeFailure({ kind: "no-open-transaction", operation: "commit" })).toMatch(/without an open/);
    expect(describeFailure({ kind: "transaction-open", operation: "undo", openLabel: "Drag" })).toMatch(/Cannot undo/);
  });
});

describe("jsonEquals", () => {
  it("compares by structure", () => {
    expect(jsonEquals({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(jsonEquals({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

/**
 * A step the engine performs is named, so a reader can be shown it in their own
 * language; a step a host opened is worded, and its wording is used as given.
 * Both end up on the stack, and the summary carries the pair.
 */
describe("a step's name and its wording", () => {
  it("words a named step from the one table, and remembers the name", () => {
    const state = record(fresh(), "crop", "0", "1");
    const summary = summarise(state);
    expect(summary.undoStep).toBe("crop");
    expect(summary.undoLabel).toBe(STEP_LABELS.crop);
  });

  it("leaves a host's own wording alone, and names nothing", () => {
    const summary = summarise(record(fresh(), "Background removal", "0", "1"));
    expect(summary.undoStep).toBeNull();
    expect(summary.undoLabel).toBe("Background removal");
  });

  it("carries the name through a transaction, not only a direct record", () => {
    const open = unwrap(begin(fresh(), "applyEdits", "0"));
    const { state } = unwrap(commit(open, "1"));
    expect(summarise(state).undoStep).toBe("applyEdits");
    expect(summarise(state).undoLabel).toBe(STEP_LABELS.applyEdits);
  });

  it("moves the pair to the redo side on undo", () => {
    const { state } = unwrap(undo(record(fresh(), "straighten", "0", "1")));
    const summary = summarise(state);
    expect(summary.redoStep).toBe("straighten");
    expect(summary.redoLabel).toBe(STEP_LABELS.straighten);
    expect(summary.undoStep).toBeNull();
  });
});
