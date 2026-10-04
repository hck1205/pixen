/**
 * What an export will cost, before anyone pays it.
 *
 * Recording runs at wall-clock speed and cannot be asked to hurry, so a long
 * clip is a long wait — and a host that finds that out by starting one has
 * already committed a person to it. This is the number to decide on: how long
 * the file will be, roughly how long making it will take, and whether that is
 * past what this host is willing to do in a browser.
 *
 * A decision rather than a policy. Nothing here refuses anything; it says what
 * a run would cost, and the host chooses between waiting, warning, and sending
 * the work somewhere else through the `recorder` seam.
 */
import { selectionDuration, wholeClip, type EditorDocument } from "@pixen/core";

/**
 * How much longer than the clip a recording takes, measured.
 *
 * 1.00× is what the sampling costs: a 1.98s clip took 1.99s and a 3.98s clip
 * took 3.98s. The overhead is the seeks between kept parts, which is why the
 * estimate counts them rather than assuming one continuous run.
 */
const REALTIME_FACTOR = 1;

/** What a seek between two kept parts costs, measured on the sample. */
const SECONDS_PER_SEEK = 0.2;

/** Past this, a browser recording is a wait rather than a moment. */
export const LONG_EXPORT_SECONDS = 120;

export interface ClipExportCost {
  /** Seconds of film the file will contain. */
  seconds: number;
  /** Roughly how long making it will take, including the seeks between parts. */
  estimatedSeconds: number;
  /** How many kept parts, since each one after the first costs a seek. */
  parts: number;
  /**
   * Whether this is past the threshold — the host's, or `LONG_EXPORT_SECONDS`.
   * True is not a refusal. It is the moment to offer a server instead.
   */
  long: boolean;
}

/**
 * `beyondSeconds` is where this host draws the line, in seconds of *waiting*
 * rather than of film, because the wait is what a person experiences.
 */
export function clipExportCost(document: EditorDocument, beyondSeconds = LONG_EXPORT_SECONDS): ClipExportCost {
  const duration = document.source.duration;
  if (duration === undefined) return { seconds: 0, estimatedSeconds: 0, parts: 0, long: false };

  const selection = document.clip ?? [wholeClip(duration)];
  const seconds = selectionDuration(selection);
  const estimatedSeconds = seconds * REALTIME_FACTOR + Math.max(0, selection.length - 1) * SECONDS_PER_SEEK;
  return { seconds, estimatedSeconds, parts: selection.length, long: estimatedSeconds > beyondSeconds };
}
