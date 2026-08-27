/**
 * The strip itself: a track, two handles, two buttons and a readout.
 *
 * The handles mark a stretch of the source; the buttons say what to do with it.
 * That is the whole interaction, and it is what makes several kept parts
 * reachable with the control there already: marking the pause and pressing
 * *Cut out* leaves the two halves either side of it.
 *
 * Marking is not an edit. Dragging a handle changes nothing about the document
 * and costs no undo step — the mark is where you are pointing, not what you
 * have decided — so the buttons are the only things that dispatch.
 *
 * Everything here is DOM and the events on it. What a drag *means* is in
 * `track.ts`, what is kept and what is marked in `mark.ts`, how it looks in
 * `style.ts`, and the plugin that installs it in `plugin.ts`.
 */
import { clipFractions, subtractRange, type ClipBounds, type ClipSelection, type Editor } from "@pixen/core";
import type { PluginText } from "@pixen/web";
import { isMoving } from "../media.js";
import type { ClipPlayer } from "../player.js";
import { keptParts, markedRange, type TrimMark } from "./mark.js";
import { dragHandle, trackLayout, trackReadout, type Handle } from "./track.js";

/** Fine enough that a handle can find a frame; coarse enough to be draggable. */
const HANDLE_STEP = 0.001;


function handleInput(
  text: PluginText,
  handle: Handle,
  duration: number,
  bounds: ClipBounds,
  mark: TrimMark,
  kept: ClipSelection,
  redraw: () => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = String(HANDLE_STEP);
  input.dataset.handle = handle;
  input.setAttribute("aria-label", text(handle));

  input.addEventListener("input", () => {
    mark.range = dragHandle(markedRange(mark, kept), duration, handle, Number(input.value), bounds);
    redraw();
  });
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
export function buildTrimStrip(
  editor: Editor,
  text: PluginText,
  bounds: ClipBounds,
  mark: TrimMark,
  player: ClipPlayer | null = null,
): Node[] {
  const duration = trimmableDuration(editor);
  if (duration === null) return [];

  const kept = keptParts(editor, duration, bounds);
  const root = document.createElement("div");
  root.className = "pixen-trim";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", text("trim"));

  const track = document.createElement("div");
  track.className = "pixen-trim-track";

  // A band per kept part, so a document keeping three of them looks like it.
  for (const part of kept) {
    const band = document.createElement("div");
    band.className = "pixen-trim-kept";
    const layout = trackLayout(part, duration);
    band.style.left = `${layout.left}%`;
    band.style.width = `${layout.width}%`;
    track.append(band);
  }

  const outline = document.createElement("div");
  outline.className = "pixen-trim-mark";
  track.append(outline);

  // Where the picture is, which is the whole reason a trim can be watched
  // rather than guessed at.
  const head = document.createElement("div");
  head.className = "pixen-trim-head";
  head.hidden = player === null;
  track.append(head);

  const readout = document.createElement("p");
  readout.className = "pixen-trim-readout";

  const showHead = (seconds: number): void => {
    head.style.left = `${(Math.max(0, Math.min(seconds, duration)) / duration) * 100}%`;
  };

  const redraw = (): void => {
    const range = markedRange(mark, kept);
    const layout = trackLayout(range, duration);
    outline.style.left = `${layout.left}%`;
    outline.style.width = `${layout.width}%`;
    readout.textContent = trackReadout(kept, duration, range);
  };

  const start = handleInput(text, "start", duration, bounds, mark, kept, redraw);
  const end = handleInput(text, "end", duration, bounds, mark, kept, redraw);
  const fractions = clipFractions(markedRange(mark, kept), duration);
  start.value = String(fractions.start);
  end.value = String(fractions.end);
  track.append(start, end);
  redraw();

  const actions = document.createElement("div");
  actions.className = "pixen-trim-actions";

  if (player) {
    const toggle = action(player.paused ? text("play") : text("pause"), () => player.toggle());
    toggle.dataset.action = "play";
    // The label is what pressing it does, not what the state is: a button
    // reading "Mute" that restores the sound is a button that lies.
    const sound = action(player.muted ? text("unmute") : text("mute"), () => player.toggleMute());
    sound.dataset.action = "mute";
    sound.setAttribute("aria-pressed", String(player.muted));
    actions.append(toggle, sound);

    // The player's own events rather than the element's: an export borrows the
    // same element and plays it, and a button that followed the element would
    // say "pause" every time somebody saved.
    const stop = [
      player.on("play", () => {
        toggle.textContent = text("pause");
      }),
      player.on("pause", () => {
        toggle.textContent = text("play");
      }),
      player.on("time", (at) => showHead(at.source)),
      player.on("mute", (at) => {
        sound.setAttribute("aria-pressed", String(at.muted));
        sound.textContent = at.muted ? text("unmute") : text("mute");
      }),
    ];
    // The section is rebuilt on every document change, so the listeners this
    // build added have to go with it.
    mark.release?.();
    mark.release = () => {
      for (const off of stop) off();
    };
    showHead(player.currentTime);
  }

  actions.append(
    action(text("keep"), () =>
      editor.dispatch({ kind: "set-clip", range: [markedRange(mark, kept)], bounds }),
    ),
    action(text("cut"), () =>
      editor.dispatch({
        kind: "set-clip",
        range: subtractRange(kept, markedRange(mark, kept), duration, bounds),
        bounds,
      }),
    ),
    action(text("whole"), () => {
      mark.range = null;
      editor.dispatch({ kind: "set-clip", range: null, bounds });
    }, editor.document.clip === null),
  );

  root.append(track, actions, readout);
  return [root];
}

function action(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

