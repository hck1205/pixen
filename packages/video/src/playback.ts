/**
 * Driving a video element through a range of its own timeline.
 *
 * Everything here is the same small problem in three costumes: wait for the
 * browser to say something, and be sure that whatever was set up to hear it is
 * undone exactly once — whether the answer came, the caller gave up, or nothing
 * happened at all. Three copies of that is where a listener gets left attached
 * and a promise settles twice, so it is written once.
 */
import { PixenError, type ClipRange } from "@pixen/core";

/** Long enough for a seek on a slow file, short enough to fail rather than hang. */
const SEEK_TIMEOUT_MS = 10_000;

export interface AwaitEventOptions {
  /** An event that means it went wrong, and the error to raise if it fires. */
  failOn?: { event: string; error: () => PixenError };
  /** Gives up after this long. Omitted waits forever. */
  timeoutMs?: number;
  /** The error raised on a timeout, if one is set. */
  onTimeout?: () => PixenError;
  signal?: AbortSignal;
  /** Names the operation in the abort message a host will see. */
  what: string;
}

/**
 * Waits for one event, cleaning up on every way out.
 *
 * The four ways out are the point: the event fires, a failure event fires, the
 * clock runs out, or the caller aborts. Each has to remove three listeners and
 * a timer, and each has to be the only one that settles the promise.
 */
export function awaitEvent(target: EventTarget, event: string, options: AwaitEventOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const undo: Array<() => void> = [];
    let settled = false;
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      for (const step of undo) step();
      finish();
    };

    const listen = (on: EventTarget, name: string, handler: () => void): void => {
      on.addEventListener(name, handler);
      undo.push(() => on.removeEventListener(name, handler));
    };

    const abort = () => settle(() => reject(new PixenError("ABORTED", `${options.what} was aborted`)));
    if (options.signal?.aborted) {
      abort();
      return;
    }

    listen(target, event, () => settle(resolve));
    if (options.failOn) {
      const { event: name, error } = options.failOn;
      listen(target, name, () => settle(() => reject(error())));
    }
    if (options.signal) listen(options.signal, "abort", abort);

    if (options.timeoutMs !== undefined && options.onTimeout) {
      const onTimeout = options.onTimeout;
      const timer = setTimeout(() => settle(() => reject(onTimeout())), options.timeoutMs);
      undo.push(() => clearTimeout(timer));
    }
  });
}

/** Moves the playhead and waits for the picture to actually be there. */
export function seekTo(element: HTMLVideoElement, seconds: number, signal: AbortSignal | undefined, what: string) {
  const waited = awaitEvent(element, "seeked", {
    timeoutMs: SEEK_TIMEOUT_MS,
    onTimeout: () => new PixenError("EXPORT_FAILED", "The video would not seek to the start of the clip"),
    what,
    ...(signal ? { signal } : {}),
  });
  element.currentTime = seconds;
  return waited;
}

/**
 * Plays from the start of the clip to its end, calling back once per frame.
 *
 * `requestVideoFrameCallback` is the right event and is asked for first: it
 * fires once per decoded frame, which is exactly one callback per frame that
 * exists. Where it is missing, `requestAnimationFrame` stands in — that fires
 * per *display* refresh instead, so a 24fps clip on a 60Hz screen paints some
 * frames more than once. Harmless for a recording, and the reason the frame
 * count is never claimed to be exact.
 *
 * The clip's end is the usual way this finishes; `ended` is the other, for a
 * clip that runs to the end of its source.
 */
export function runClip(
  element: HTMLVideoElement,
  clip: ClipRange,
  signal: AbortSignal | undefined,
  what: string,
  onFrame: (seconds: number) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const stop = (settle: () => void): void => {
      if (stopped) return;
      stopped = true;
      element.removeEventListener("ended", onEnded);
      signal?.removeEventListener("abort", onAbort);
      element.pause();
      settle();
    };
    const onEnded = () => stop(resolve);
    const onAbort = () => stop(() => reject(new PixenError("ABORTED", `${what} was aborted`)));

    const step = (): void => {
      if (stopped) return;
      if (element.currentTime >= clip.end) {
        stop(resolve);
        return;
      }
      void onFrame(element.currentTime - clip.start).then(
        () => {
          if (!stopped) schedule();
        },
        (error: unknown) => stop(() => reject(error)),
      );
    };
    const schedule = (): void => {
      if (typeof element.requestVideoFrameCallback === "function") element.requestVideoFrameCallback(() => step());
      else requestAnimationFrame(() => step());
    };

    element.addEventListener("ended", onEnded);
    signal?.addEventListener("abort", onAbort);
    if (signal?.aborted) {
      onAbort();
      return;
    }

    element.play().then(schedule, (error: unknown) => stop(() => reject(error)));
  });
}
