import { describe, expect, it } from "vitest";
import { ARROW_VECTORS, nudgeDistance, resolveKeyboardAction, type KeyboardContext } from "../src/element/input/keyboard.js";
import { DEFAULT_TOOLS } from "../src/tools/index.js";
import { NUDGE_FAST_MULTIPLIER, NUDGE_FRACTION } from "../src/element/constants.js";

const context = (overrides: Partial<KeyboardContext> = {}): KeyboardContext => ({
  tools: DEFAULT_TOOLS,
  hasSelection: false,
  ready: true,
  ...overrides,
});

describe("history shortcuts", () => {
  it("undoes on the platform modifier", () => {
    expect(resolveKeyboardAction({ key: "z", metaKey: true }, context())).toEqual({
      action: { kind: "undo" },
      preventDefault: true,
    });
    expect(resolveKeyboardAction({ key: "z", ctrlKey: true }, context())?.action).toEqual({ kind: "undo" });
  });

  it("redoes on shift, and on the Windows spelling", () => {
    expect(resolveKeyboardAction({ key: "z", ctrlKey: true, shiftKey: true }, context())?.action).toEqual({
      kind: "redo",
    });
    expect(resolveKeyboardAction({ key: "y", ctrlKey: true }, context())?.action).toEqual({ kind: "redo" });
  });

  it("accepts an upper-case key, which is what shift produces", () => {
    expect(resolveKeyboardAction({ key: "Z", metaKey: true, shiftKey: true }, context())?.action).toEqual({
      kind: "redo",
    });
  });

  it("ignores the letter without a modifier", () => {
    expect(resolveKeyboardAction({ key: "z" }, context())).toBeNull();
  });
});

describe("selection shortcuts", () => {
  it("deletes only when something is selected", () => {
    expect(resolveKeyboardAction({ key: "Delete" }, context({ hasSelection: true }))).toEqual({
      action: { kind: "delete-selection" },
      preventDefault: true,
    });
    expect(resolveKeyboardAction({ key: "Delete" }, context({ hasSelection: false }))).toBeNull();
  });

  it("treats backspace the same way", () => {
    expect(resolveKeyboardAction({ key: "Backspace" }, context({ hasSelection: true }))?.action).toEqual({
      kind: "delete-selection",
    });
  });

  it("clears the selection on escape, without swallowing the key", () => {
    expect(resolveKeyboardAction({ key: "Escape" }, context())).toEqual({
      action: { kind: "clear-selection" },
      preventDefault: false,
    });
  });
});

describe("nudging", () => {
  it("moves the selection in the arrow's direction", () => {
    const command = resolveKeyboardAction({ key: "ArrowLeft" }, context({ hasSelection: true }));
    expect(command?.action).toEqual({ kind: "nudge", direction: ARROW_VECTORS.ArrowLeft, fast: false });
    expect(command?.preventDefault).toBe(true);
  });

  it("goes faster with shift", () => {
    const command = resolveKeyboardAction({ key: "ArrowDown", shiftKey: true }, context({ hasSelection: true }));
    expect(command?.action).toMatchObject({ fast: true });
  });

  it("does nothing without a selection, so the page can still scroll", () => {
    expect(resolveKeyboardAction({ key: "ArrowUp" }, context({ hasSelection: false }))).toBeNull();
  });

  it("does nothing before an image is loaded", () => {
    expect(resolveKeyboardAction({ key: "ArrowUp" }, context({ hasSelection: true, ready: false }))).toBeNull();
  });

  it("scales the step with the image and with shift", () => {
    expect(nudgeDistance(1000, false)).toBeCloseTo(1000 * NUDGE_FRACTION);
    expect(nudgeDistance(1000, true)).toBeCloseTo(1000 * NUDGE_FRACTION * NUDGE_FAST_MULTIPLIER);
  });

  it("covers all four arrows", () => {
    expect(Object.keys(ARROW_VECTORS).sort()).toEqual(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
  });
});

describe("tool shortcuts", () => {
  it("selects the tool whose letter was pressed", () => {
    expect(resolveKeyboardAction({ key: "c" }, context())?.action).toEqual({ kind: "select-tool", tool: "crop" });
    expect(resolveKeyboardAction({ key: "T" }, context())?.action).toEqual({ kind: "select-tool", tool: "text" });
  });

  it("only offers the tools the host enabled", () => {
    const limited = context({ tools: [{ id: "crop" }] });
    expect(resolveKeyboardAction({ key: "t" }, limited)).toBeNull();
    expect(resolveKeyboardAction({ key: "c" }, limited)?.action).toEqual({ kind: "select-tool", tool: "crop" });
  });

  it("does nothing with no picture open, since the rail's buttons are disabled too", () => {
    // A shortcut arming a tool the rail says is unavailable is the two
    // disagreeing about the same thing.
    expect(resolveKeyboardAction({ key: "c" }, context({ ready: false }))).toBeNull();
  });

  it("leaves the key alone so a host shortcut can still use it", () => {
    expect(resolveKeyboardAction({ key: "c" }, context())?.preventDefault).toBe(false);
  });

  it("never fires while a modifier is held", () => {
    expect(resolveKeyboardAction({ key: "c", metaKey: true }, context())).toBeNull();
  });
});

describe("zoom shortcut", () => {
  it("fits the view on modifier + 0", () => {
    expect(resolveKeyboardAction({ key: "0", metaKey: true }, context())?.action).toEqual({ kind: "zoom-to-fit" });
  });

  it("ignores a bare 0", () => {
    expect(resolveKeyboardAction({ key: "0" }, context())).toBeNull();
  });
});

describe("unknown keys", () => {
  it("resolve to nothing", () => {
    expect(resolveKeyboardAction({ key: "F5" }, context())).toBeNull();
    expect(resolveKeyboardAction({ key: "Tab" }, context())).toBeNull();
  });
});

describe("editing text from the keyboard", () => {
  it("opens the selected text layer on Enter", () => {
    const command = resolveKeyboardAction({ key: "Enter" }, context({ hasSelection: true, textSelected: true }));
    expect(command).toEqual({ action: { kind: "edit-text" }, preventDefault: true });
  });

  it("leaves Enter alone when the selection is not text", () => {
    expect(resolveKeyboardAction({ key: "Enter" }, context({ hasSelection: true }))).toBeNull();
  });

  it("leaves Enter alone with nothing selected", () => {
    expect(resolveKeyboardAction({ key: "Enter" }, context())).toBeNull();
  });
});
