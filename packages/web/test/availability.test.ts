import { describe, expect, it } from "vitest";
import { createDocument, type EditorDocument, type HistorySummary } from "@pixen/core";
import {
  chromeAvailability,
  railPanelState,
  railToolState,
} from "../src/element/chrome/availability.js";

/**
 * These two were the chrome's only decisions made inside a DOM write, so
 * "is Export disabled while an export is running but no picture is open?" could
 * only be answered by opening a browser.
 */
const untouched = (): EditorDocument => createDocument({ resourceId: "res_1", width: 800, height: 600 });

const history = (over: Partial<HistorySummary> = {}): HistorySummary => ({
  canUndo: false,
  canRedo: false,
  depth: 0,
  undoLabel: null,
  redoLabel: null,
  inTransaction: false,
  ...over,
});

const conditions = (over: Partial<Parameters<typeof chromeAvailability>[0]> = {}) => ({
  ready: true,
  busy: false,
  document: untouched(),
  history: history(),
  pluginActions: [],
  ...over,
});

describe("chromeAvailability", () => {
  it("offers undo and redo only when there is something to undo or redo", () => {
    expect(chromeAvailability(conditions()).undo).toBe(true);
    expect(chromeAvailability(conditions({ history: history({ canUndo: true }) })).undo).toBe(false);
    expect(chromeAvailability(conditions({ history: history({ canRedo: true }) })).redo).toBe(false);
  });

  it("disables reset on a picture nothing has been done to", () => {
    expect(chromeAvailability(conditions()).reset).toBe(true);

    const adjusted = { ...untouched(), adjustments: { ...untouched().adjustments, vignette: 0.5 } };
    expect(chromeAvailability(conditions({ document: adjusted })).reset).toBe(false);
  });

  it("disables everything that needs a picture when there is none", () => {
    const empty = chromeAvailability(conditions({ ready: false, document: null }));
    expect(empty.reset).toBe(true);
    expect(empty.export).toBe(true);
  });

  it("disables export while one is already running, picture or not", () => {
    expect(chromeAvailability(conditions({ busy: true })).export).toBe(true);
    expect(chromeAvailability(conditions({ busy: true, ready: false, document: null })).export).toBe(true);
  });

  it("asks each plugin action rather than remembering its answer", () => {
    const available = chromeAvailability(
      conditions({
        pluginActions: [
          { id: "a", disabled: () => true },
          { id: "b", disabled: () => false },
          { id: "c" },
        ],
      }),
    );
    expect(available.plugins).toEqual({ a: true, b: false, c: false });
  });
});

describe("the rail's buttons", () => {
  const armed = { ready: true, panel: "tool" as const, tool: "crop" as const };

  it("presses the armed tool, and only while its own panel is showing", () => {
    expect(railToolState(armed, "crop").pressed).toBe(true);
    expect(railToolState(armed, "select").pressed).toBe(false);
    // The layer list is open: the crop tool is still armed but is not what the
    // panel is showing, and two pressed buttons would claim otherwise.
    expect(railToolState({ ...armed, panel: "layers" }, "crop").pressed).toBe(false);
  });

  it("presses the open panel", () => {
    expect(railPanelState({ ...armed, panel: "layers" }, "layers").pressed).toBe(true);
    expect(railPanelState(armed, "layers").pressed).toBe(false);
  });

  it("disables both kinds with no picture open", () => {
    expect(railToolState({ ...armed, ready: false }, "crop").disabled).toBe(true);
    expect(railPanelState({ ...armed, ready: false }, "layers").disabled).toBe(true);
  });
});
