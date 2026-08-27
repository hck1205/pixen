import { describe, expect, it } from "vitest";
import { STEP_LABELS, STEP_NAMES, type HistorySummary } from "@pixen/core";
import { ar } from "../src/i18n/ar.js";
import { de } from "../src/i18n/de.js";
import { en } from "../src/i18n/en.js";
import { es } from "../src/i18n/es.js";
import { fr } from "../src/i18n/fr.js";
import { ja } from "../src/i18n/ja.js";
import { ko } from "../src/i18n/ko.js";
import { pt } from "../src/i18n/pt.js";
import { zh } from "../src/i18n/zh.js";
import {
  isAppleShortcutPlatform,
  modifierLabel,
  panelLabel,
  redoLabel,
  shortcutLabel,
  sizeLabel,
  stepLabel,
  undoLabel,
  zoomLabel,
} from "../src/element/labels.js";

const history = (overrides: Partial<HistorySummary> = {}): HistorySummary => ({
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  undoStep: null,
  redoStep: null,
  depth: 0,
  inTransaction: false,
  ...overrides,
});

describe("platform modifier", () => {
  it("recognises Apple platforms", () => {
    expect(isAppleShortcutPlatform("MacIntel")).toBe(true);
    expect(isAppleShortcutPlatform("iPhone")).toBe(true);
    expect(isAppleShortcutPlatform("Win32")).toBe(false);
    expect(isAppleShortcutPlatform(undefined)).toBe(false);
    expect(isAppleShortcutPlatform("")).toBe(false);
  });

  it("renders the right modifier symbol", () => {
    expect(modifierLabel(true)).toBe("⌘");
    expect(modifierLabel(false)).toBe("Ctrl");
  });
});

describe("undo and redo labels", () => {
  it("shows the shortcut when there is nothing to undo", () => {
    expect(undoLabel(en, history(), false)).toBe("Undo (Ctrl+Z)");
    expect(undoLabel(en, null, true)).toBe("Undo (⌘Z)");
  });

  it("names the action once there is one", () => {
    expect(undoLabel(en, history({ canUndo: true, undoLabel: "Crop" }), true)).toBe("Undo: Crop (⌘Z)");
  });

  it("ignores a stale label when the stack is empty", () => {
    expect(undoLabel(en, history({ canUndo: false, undoLabel: "Crop" }), false)).toBe("Undo (Ctrl+Z)");
  });

  it("does the same for redo, with the shift modifier", () => {
    expect(redoLabel(en, history({ canRedo: true, redoLabel: "Rotate" }), true)).toBe("Redo: Rotate (⌘⇧Z)");
    expect(redoLabel(en, history(), false)).toBe("Redo (Ctrl+⇧Z)");
  });

  it("follows the active locale", () => {
    expect(undoLabel(ko, history({ canUndo: true, undoLabel: "자르기" }), true)).toBe("실행 취소: 자르기 (⌘Z)");
  });
});

describe("zoomLabel", () => {
  it("rounds to whole percents at normal zoom", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(0.4444)).toBe("44%");
    expect(zoomLabel(2.5)).toBe("250%");
  });

  it("keeps a decimal when zoomed far out, where whole percents collapse", () => {
    expect(zoomLabel(0.043)).toBe("4.3%");
  });

  it("refuses to render a nonsense zoom", () => {
    expect(zoomLabel(0)).toBe("—");
    expect(zoomLabel(Number.NaN)).toBe("—");
    expect(zoomLabel(-1)).toBe("—");
  });
});

describe("sizeLabel", () => {
  it("reads as a pixel size", () => {
    expect(sizeLabel({ width: 1600, height: 1067 })).toBe("1600 × 1067");
  });

  it("rounds sub-pixel sizes", () => {
    expect(sizeLabel({ width: 799.6, height: 450.2 })).toBe("800 × 450");
  });
});

/**
 * Two spellings of the same modifier were in use: the undo button read
 * "Undo (CtrlZ)" beside a Fit button reading "Fit (Ctrl+0)". The plus is not
 * decoration — on Apple the symbol reads as a modifier by itself, and on
 * Windows the word does not.
 */
describe("shortcutLabel", () => {
  it("joins the Windows modifier with a plus and the Apple one without", () => {
    expect(shortcutLabel(false, "Z")).toBe("Ctrl+Z");
    expect(shortcutLabel(true, "Z")).toBe("⌘Z");
  });

  it("is the spelling the undo button uses, so the chrome cannot disagree with itself", () => {
    expect(undoLabel(en, history(), false)).toContain(`(${shortcutLabel(false, "Z")})`);
    expect(undoLabel(en, history(), true)).toContain(`(${shortcutLabel(true, "Z")})`);
  });
});

/**
 * The panel's own name, announced when it opens.
 *
 * A decision rather than a lookup: the tool panel has no name of its own and
 * borrows the armed tool's, and a tool with no entry falls back — because the
 * announcement is for a screen reader, and silence is the answer that helps
 * nobody.
 */
describe("panelLabel", () => {
  it("names a panel that has its own name", () => {
    expect(panelLabel("adjust", "crop", en)).toBe(en.adjustments);
    expect(panelLabel("layers", "crop", en)).toBe(en.layers);
  });

  it("borrows the armed tool's name for the tool panel", () => {
    expect(panelLabel("tool", "text", en)).toBe(en.text);
    expect(panelLabel("tool", "crop", en)).toBe(en.crop);
  });

  it("says something rather than nothing for a tool it does not know", () => {
    expect(panelLabel("tool", "not-a-tool" as never, en)).toBe(en.crop);
  });

  it("is in the locale it was given", () => {
    expect(panelLabel("layers", "crop", ko)).toBe(ko.layers);
  });
});

/**
 * The undo button was saying what it would undo in English in every language:
 * the verb came from the locale and the step came from the engine, so Korean
 * read "실행취소: Crop". The engine now names its steps and the locale words
 * them, and a step a host worded itself is still shown exactly as given.
 */
describe("a step in the reader's language", () => {
  it("words a named step from the locale", () => {
    expect(stepLabel(ko, "crop", "Crop")).toBe(ko.stepCrop);
    expect(stepLabel(ja, "deleteLayer", "Delete annotation")).toBe(ja.stepDeleteLayer);
  });

  it("leaves a label with no name exactly as it was written", () => {
    expect(stepLabel(ko, null, "Background removal")).toBe("Background removal");
  });

  it("has nothing to say when there is nothing on the stack", () => {
    expect(stepLabel(ko, null, null)).toBeNull();
  });

  it("puts the translated step in the button's own label", () => {
    const summary = history({ canUndo: true, undoStep: "crop", undoLabel: "Crop" });
    expect(undoLabel(ko, summary, false)).toBe(`${ko.undo}${ko.stepSeparator}${ko.stepCrop} (Ctrl+Z)`);
    expect(undoLabel(en, summary, false)).toBe("Undo: Crop (Ctrl+Z)");
  });

  it("does the same for redo, on the other side of the stack", () => {
    const summary = history({ canRedo: true, redoStep: "straighten", redoLabel: "Straighten" });
    expect(redoLabel(ko, summary, false)).toBe(`${ko.redo}${ko.stepSeparator}${ko.stepStraighten} (Ctrl+⇧Z)`);
    // French puts a space before a colon; the separator is a locale string.
    expect(redoLabel(fr, history({ canRedo: true, redoStep: "crop", redoLabel: "Crop" }), false)).toBe(
      `${fr.redo} : ${fr.stepCrop} (Ctrl+⇧Z)`,
    );
  });

  it("covers every step the engine can name, in every locale it ships", () => {
    // A missing key would fall back to English silently, which is the bug this
    // whole change is about — so the coverage is the test.
    for (const [name, strings] of Object.entries({ en, ar, de, es, fr, ja, ko, pt, zh })) {
      for (const step of STEP_NAMES) {
        const worded = stepLabel(strings, step, "fallback");
        expect(worded, `${name}.${step}`).toBeTruthy();
        expect(worded, `${name}.${step}`).not.toBe("fallback");
        if (name !== "en") {
          expect(worded, `${name}.${step} is still English`).not.toBe(STEP_LABELS[step]);
        }
      }
    }
  });
});
