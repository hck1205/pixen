/**
 * Playing the clip, rather than the file.
 *
 * The editor could trim a video it could not play, which is trimming blind. The
 * platform can play the *file* — `openVideo` hands the element back and
 * `element.play()` has always worked — but a clip is not a file: it is the kept
 * parts, and playing it means running each of them and skipping what is between.
 * That is the part no media element can do, and the reason this exists rather
 * than a wrapper around six one-line calls.
 *
 * The state it reports is what it was *asked* for, not what the element is
 * doing. An export borrows the same element and plays it — measured, a host
 * listening to the element sees `play` and `pause` it never asked for — so a
 * player that echoed the element would lie about the picture every time
 * somebody saved. Pause before exporting; what comes back is still paused.
 */
import { clipDuration, Emitter, selectionDuration, wholeClip, type ClipSelection, type Editor } from "@pixen/core";

/** How often the position is reported while playing, in milliseconds. */
const TIME_REPORT_MS = 100;

/** Near enough to the end of a part to move on, rather than overshooting it. */
const EDGE_SECONDS = 0.02;

export interface ClipPlayerEvents {
  /** The clip started running. */
  play: undefined;
  /** It stopped — asked to, or because it reached the end. */
  pause: { ended: boolean };
  /** Where the playhead is, in the source and in the kept film. */
  time: { source: number; clip: number };
  /** The sound was silenced or restored. */
  mute: { muted: boolean };
}

export class ClipPlayer {
  readonly #element: HTMLVideoElement;
  readonly #editor: Editor;
  readonly #emitter = new Emitter<ClipPlayerEvents>();
  #running = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(element: HTMLVideoElement, editor: Editor) {
    this.#element = element;
    this.#editor = editor;
  }

  readonly on = <K extends keyof ClipPlayerEvents>(
    event: K,
    listener: (payload: ClipPlayerEvents[K]) => void,
  ): (() => void) => this.#emitter.on(event, listener);

  /** The source's own length. Zero for a document that does not move. */
  get duration(): number {
    return this.#editor.document.source.duration ?? 0;
  }

  /** How much film the kept parts add up to, which is what an export writes. */
  get clipDuration(): number {
    return selectionDuration(this.#parts());
  }

  get paused(): boolean {
    return !this.#running;
  }

  get muted(): boolean {
    return this.#element.muted;
  }

  /** Where the playhead is, in the source's own seconds. */
  get currentTime(): number {
    return this.#element.currentTime;
  }

  /**
   * Moves the playhead, into the kept film rather than merely into the source.
   *
   * A second that was cut out is not somewhere the playhead can be: asking for
   * one lands on the start of the next kept part, which is where playing from
   * there would have gone anyway.
   */
  set currentTime(seconds: number) {
    this.#element.currentTime = nextKeptSecond(this.#parts(), seconds);
    this.#report();
  }

  play(): void {
    if (this.#running) return;
    // From the beginning of the kept film when the playhead is at its end,
    // because a play button at the end of a clip means "again".
    if (this.#atEnd()) this.#element.currentTime = this.#parts()[0]!.start;
    this.#running = true;
    void this.#element.play().catch(() => this.pause());
    this.#timer = setInterval(() => this.#tick(), TIME_REPORT_MS);
    this.#emitter.emit("play", undefined);
  }

  pause(): void {
    this.#stop(false);
  }

  /** One control for both, which is what a play button is. */
  toggle(): void {
    if (this.#running) this.pause();
    else this.play();
  }

  mute(): void {
    this.#setMuted(true);
  }

  unmute(): void {
    this.#setMuted(false);
  }

  toggleMute(): void {
    this.#setMuted(!this.#element.muted);
  }

  /** Stops and lets go of the timer. Playing again after this is fine. */
  destroy(): void {
    this.#stop(false);
    this.#emitter.clear();
  }

  #parts(): ClipSelection {
    return this.#editor.document.clip ?? [wholeClip(this.duration)];
  }

  #atEnd(): boolean {
    const parts = this.#parts();
    const last = parts[parts.length - 1]!;
    return this.#element.currentTime >= last.end - EDGE_SECONDS;
  }

  #setMuted(muted: boolean): void {
    if (this.#element.muted === muted) return;
    this.#element.muted = muted;
    this.#emitter.emit("mute", { muted });
  }

  #stop(ended: boolean): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    if (!this.#running) return;
    this.#running = false;
    this.#element.pause();
    this.#emitter.emit("pause", { ended });
  }

  /**
   * One step of playing the clip rather than the file.
   *
   * Reaching the end of a kept part means jumping to the start of the next one,
   * and reaching the end of the last one means the clip is over. Polled rather
   * than driven by `timeupdate`, which fires about four times a second — too
   * coarse to land a cut on.
   */
  #tick(): void {
    const parts = this.#parts();
    const at = this.#element.currentTime;
    const part = parts.find((range) => at < range.end - EDGE_SECONDS && at >= range.start - EDGE_SECONDS);

    if (!part) {
      const next = parts.find((range) => range.start > at);
      if (next) this.#element.currentTime = next.start;
      else {
        this.#stop(true);
        return;
      }
    }
    this.#report();
  }

  #report(): void {
    this.#emitter.emit("time", {
      source: this.#element.currentTime,
      clip: clipTimeOf(this.#parts(), this.#element.currentTime),
    });
  }
}

/**
 * Where a moment in the source sits in the kept film.
 *
 * The parts before it in full, plus how far into the one it falls in. A moment
 * that was cut out counts as the start of whatever follows it, because that is
 * the next thing anyone watching would see.
 */
export function clipTimeOf(parts: ClipSelection, seconds: number): number {
  let elapsed = 0;
  for (const part of parts) {
    if (seconds < part.start) return elapsed;
    if (seconds <= part.end) return elapsed + (seconds - part.start);
    elapsed += clipDuration(part);
  }
  return elapsed;
}

/** The first second at or after this one that is actually kept. */
export function nextKeptSecond(parts: ClipSelection, seconds: number): number {
  for (const part of parts) {
    if (seconds < part.start) return part.start;
    if (seconds <= part.end) return seconds;
  }
  return parts[parts.length - 1]?.end ?? 0;
}
