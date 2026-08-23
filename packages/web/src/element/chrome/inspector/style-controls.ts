import type { EditorLayer } from "@pixen/core";
import type { ToolId } from "../../../tools/index.js";

/**
 * Which style controls belong to a given subject.
 *
 * The model has always carried more than the inspector offered — a fill, a
 * corner radius, a dash, an alignment — and the reason was that "which controls
 * apply here" was buried in a DOM builder. It is a pure function over the tool
 * and the selection, so it is answerable in a test and the builder is left with
 * nothing but rendering.
 */
export type StyleControl =
  | "colour"
  | "fill"
  | "width"
  | "dash"
  | "corner"
  | "fontSize"
  | "align"
  | "textPlate"
  | "lineEnds";

export interface StyleSubject {
  /** The active tool, which decides what the *next* annotation will look like. */
  tool: ToolId;
  /** The selected layer, which outranks the tool: its own kind decides. */
  layerType?: EditorLayer["type"] | undefined;
}

/** Closed shapes can be filled and stroked; open ones only stroked. */
const SHAPE_CONTROLS: StyleControl[] = ["colour", "fill", "width", "dash"];
const TEXT_CONTROLS: StyleControl[] = ["colour", "fontSize", "align", "textPlate"];

/** The kind of layer a subject is about: its selection if it has one, else its tool. */
function styleSubjectKind(subject: StyleSubject): EditorLayer["type"] | null {
  // A selection is a concrete thing; the tool is only a plan for the next one.
  return subject.layerType ?? toolLayerKind(subject.tool);
}

/**
 * The layer a style control may patch, which is not simply "the selected one".
 *
 * Arming a tool does not clear the selection, and the style section is built
 * from the tool alone — so a rectangle stays selected while the text tool puts
 * up the alignment buttons. Pressing one wrote `align` onto the rectangle,
 * through `updateLayer`, which spreads a patch without asking what it is
 * patching: a field that means nothing on that layer, in the document and in
 * the undo history. The arrow tool did the same with `arrowStart` on text.
 *
 * Two controls guarded themselves, so the answer was already known here; this
 * is it in one place, for all of them.
 */
export function styleTarget(subject: StyleSubject, selected: EditorLayer | null): EditorLayer | null {
  if (!selected) return null;
  return selected.type === styleSubjectKind(subject) ? selected : null;
}

export function styleControlsFor(subject: StyleSubject): StyleControl[] {
  const kind = styleSubjectKind(subject);

  switch (kind) {
    case "rect":
      return [...SHAPE_CONTROLS, "corner"];
    case "ellipse":
      return SHAPE_CONTROLS;
    case "line":
      return ["colour", "width", "dash", "lineEnds"];
    case "path":
      return ["colour", "width", "dash"];
    case "text":
      return TEXT_CONTROLS;
    // A bitmap has no colour of its own, and a redaction has its own section.
    case "image":
    case "redact":
      return [];
    default:
      return [];
  }
}

/** The kind of layer a tool draws, or null for tools that draw none. */
function toolLayerKind(tool: ToolId): EditorLayer["type"] | null {
  switch (tool) {
    case "rect":
      return "rect";
    case "ellipse":
      return "ellipse";
    case "arrow":
      return "line";
    case "draw":
      return "path";
    case "text":
      return "text";
    case "redact":
      return "redact";
    case "crop":
    case "select":
    case "sticker":
      return null;
  }
}
