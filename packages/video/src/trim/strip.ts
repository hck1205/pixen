/**
 * The strip itself: a track, two handles and a readout.
 *
 * Everything here is DOM and the events on it. What a drag *means* is next
 * door in `track.ts`, and the plugin that installs this is in `plugin.ts` —
 * three questions that were one file until the file had to be read twice to
 * answer any of them.
 */
import {
  clampSelection,
  clipFractions,
  wholeClip,
  type ClipBounds,
  type ClipRange,
  type ClipSelection,
  type Editor,
} from "@pixen/core";
import type { PluginText } from "@pixen/web";
import { isMoving } from "../media.js";
import { dragHandle, trackLayout, trackReadout, type Handle } from "./track.js";

/** Fine enough that a handle can find a frame; coarse enough to be draggable. */
const HANDLE_STEP = 0.001;

const STYLE = `
.pixen-trim { display: grid; gap: 6px; min-width: 220px; }
.pixen-trim-track { position: relative; height: 26px; border-radius: 8px;
  background: rgb(var(--pixen-tint, 127 140 170) / 0.18); overflow: hidden; }
.pixen-trim-kept { position: absolute; top: 0; bottom: 0;
  background: var(--pixen-accent, #4f8cff); opacity: 0.45; }
.pixen-trim input { position: absolute; inset: 0; width: 100%; margin: 0;
  appearance: none; background: none; pointer-events: none; }
.pixen-trim input::-webkit-slider-thumb { appearance: none; pointer-events: auto;
  width: 12px; height: 26px; border-radius: 4px; cursor: ew-resize;
  background: var(--pixen-accent-contrast, #fff); border: 1px solid var(--pixen-accent, #4f8cff); }
.pixen-trim input::-moz-range-thumb { pointer-events: auto; width: 12px; height: 26px;
  border-radius: 4px; cursor: ew-resize;
  background: var(--pixen-accent-contrast, #fff); border: 1px solid var(--pixen-accent, #4f8cff); }
.pixen-trim-readout { font: 400 12px/1.4 system-ui, sans-serif; opacity: 0.75; }
`;

/**
 * The range the strip is showing.
 *
 * A document with no clip means the whole source — but under a ceiling the
 * whole source is not something the host will take, so what the handles show is
 * the longest clip the rule allows. Showing three seconds selected under a
 * one-second rule would be an interface disagreeing with itself before anyone
 * had touched it.
 */
function currentSelection(editor: Editor, duration: number, bounds: ClipBounds): ClipSelection {
  return clampSelection(editor.document.clip ?? [wholeClip(duration)], duration, bounds);
}

/**
 * The part the two handles are editing.
 *
 * The first, for now. A document can keep several parts and the track draws
 * every one of them; choosing between them is the next piece of this control,
 * and until it exists the handles work the part they always did.
 */
function editedPart(selection: ClipSelection): ClipRange {
  return selection[0]!;
}

function handleInput(
  editor: Editor,
  text: PluginText,
  handle: Handle,
  duration: number,
  bounds: ClipBounds,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = String(HANDLE_STEP);
  input.dataset.handle = handle;
  input.setAttribute("aria-label", text(handle));

  // One transaction for the whole drag, so a trim undoes as one step however
  // many times the value changed on the way.
  let dragging = false;
  const begin = () => {
    if (dragging) return;
    dragging = true;
    editor.beginTransaction(text("trim"));
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    editor.commitTransaction();
  };

  input.addEventListener("pointerdown", begin);
  input.addEventListener("keydown", begin);
  input.addEventListener("input", () => {
    begin();
    // The engine's own vocabulary rather than a convenience method: intents are
    // data, and a plugin has the same way in as the element does.
    editor.dispatch({
      kind: "set-clip",
      range: [
        dragHandle(editedPart(currentSelection(editor, duration, bounds)), duration, handle, Number(input.value), bounds),
        ...currentSelection(editor, duration, bounds).slice(1),
      ],
      bounds,
    });
  });
  input.addEventListener("change", end);
  input.addEventListener("blur", end);
  return input;
}


/**
 * The source's own length, or null when this document is a still picture.
 *
 * Both the strip and the section that holds it ask this: one to draw, the
 * other to decide whether to appear at all.
 */
export function trimmableDuration(editor: Editor): number | null {
  if (!editor.ready || !isMoving(editor.document)) return null;
  return editor.document.source.duration ?? null;
}

/** The strip, or nothing at all when this document is a still picture. */
export function buildTrimStrip(editor: Editor, text: PluginText, bounds: ClipBounds = {}): Node[] {
  const duration = trimmableDuration(editor);
  if (duration === null) return [];

  const selection = currentSelection(editor, duration, bounds);
  const clip = editedPart(selection);
  const fractions = clipFractions(clip, duration);

  const root = document.createElement("div");
  root.className = "pixen-trim";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", text("trim"));

  const track = document.createElement("div");
  track.className = "pixen-trim-track";
  // A band per kept part, so a document keeping three of them looks like it.
  for (const part of selection) {
    const kept = document.createElement("div");
    kept.className = "pixen-trim-kept";
    const layout = trackLayout(part, duration);
    kept.style.left = `${layout.left}%`;
    kept.style.width = `${layout.width}%`;
    track.append(kept);
  }

  const start = handleInput(editor, text, "start", duration, bounds);
  start.value = String(fractions.start);
  const end = handleInput(editor, text, "end", duration, bounds);
  end.value = String(fractions.end);
  track.append(start, end);

  const readout = document.createElement("p");
  readout.className = "pixen-trim-readout";
  readout.textContent = trackReadout(selection, duration);

  const whole = document.createElement("button");
  whole.type = "button";
  whole.className = "text";
  whole.textContent = text("whole");
  // `null` is the whole source, and `setClip` is what knows that a ceiling may
  // not allow the whole source — so the button says what it means and the
  // engine decides what that turns out to be.
  whole.disabled = editor.document.clip === null;
  whole.addEventListener("click", () => editor.dispatch({ kind: "set-clip", range: null, bounds }));

  root.append(track, readout, whole);
  return [root];
}

/** The stylesheet the strip needs, put into the element's shadow root. */
export function trimStyleElement(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = STYLE;
  return style;
}
