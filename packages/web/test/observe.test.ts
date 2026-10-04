import { describe, expect, it } from "vitest";
import { Emitter, type Editor, type EditorEvents, type ProgressReport } from "@pixen/core";
import { observeEditor, type ObserverPorts } from "../src/element/observe.js";

/** Enough of an editor to be listened to; the mapping never calls anything else. */
function fakeEditor() {
  const emitter = new Emitter<EditorEvents>();
  return {
    editor: { on: emitter.on.bind(emitter) } as unknown as Editor,
    emit: <K extends keyof EditorEvents>(event: K, payload: EditorEvents[K]) => emitter.emit(event, payload),
  };
}

function ports() {
  const calls: string[] = [];
  const emitted: Array<{ type: string; detail: unknown }> = [];
  const reports: Array<ProgressReport | null> = [];
  const spy: ObserverPorts = {
    emit: (type, detail) => {
      calls.push(type);
      emitted.push({ type, detail });
    },
    refresh: () => calls.push("refresh"),
    refreshReadouts: () => calls.push("readouts"),
    progress: (report) => {
      calls.push("progress");
      reports.push(report);
    },
    closed: () => calls.push("closed"),
  };
  return { spy, calls, emitted, reports };
}

const report: ProgressReport = { task: "load", stage: "fetch", loaded: 1, total: 4, ratio: 0.25 };
const document = { id: "doc" } as never;

describe("observeEditor", () => {
  it("forwards an engine event to the DOM unchanged", () => {
    const { editor, emit } = fakeEditor();
    const { spy, emitted } = ports();
    observeEditor(editor, spy);

    emit("export-start", { format: "image/webp" });
    expect(emitted).toEqual([{ type: "pixen-export-start", detail: { format: "image/webp" } }]);
  });

  it("reshapes an error, so a listener reads event.detail.error", () => {
    const { editor, emit } = fakeEditor();
    const { spy, emitted } = ports();
    observeEditor(editor, spy);

    const error = { code: "DECODE_FAILED" } as never;
    emit("error", error);
    expect(emitted).toEqual([{ type: "pixen-error", detail: { error } }]);
  });

  /**
   * A drag emits transient changes at pointer speed. Rebuilding the inspector
   * for each one steals focus; leaving the readouts stale shows a crop the
   * wrong size. The split between the two is the whole decision here.
   */
  it("updates the readouts for a transient change and the chrome for a settled one", () => {
    const { editor, emit } = fakeEditor();
    const { spy, calls } = ports();
    observeEditor(editor, spy);

    emit("change", { document, reason: "crop", transient: true });
    expect(calls).toEqual(["pixen-change", "readouts"]);

    calls.length = 0;
    emit("change", { document, reason: "crop", transient: false });
    expect(calls).toEqual(["pixen-change", "refresh"]);
  });

  it("clears the reading when a task begins and records it as one arrives", () => {
    const { editor, emit } = fakeEditor();
    const { spy, reports } = ports();
    observeEditor(editor, spy);

    emit("load-start", { replace: false });
    emit("load-progress", report);
    emit("export-start", { format: "image/png" });
    emit("export-progress", { ...report, task: "export" });

    expect(reports).toEqual([null, report, null, { ...report, task: "export" }]);
  });

  it("hears a close the element did not start", () => {
    const { editor, emit } = fakeEditor();
    const { spy, calls } = ports();
    observeEditor(editor, spy);

    emit("close", undefined);
    expect(calls).toEqual(["closed"]);
  });

  it("stops listening when the returned unsubscribes are called", () => {
    const { editor, emit } = fakeEditor();
    const { spy, calls } = ports();
    for (const off of observeEditor(editor, spy)) off();

    emit("selection", { id: null });
    emit("export", {} as never);
    expect(calls).toEqual([]);
  });
});
