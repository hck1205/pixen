/**
 * The shape a long-running step reports itself in.
 *
 * Deliberately not "percent done". A percentage implies someone knows the
 * total, and for most of what this engine does nobody does: a decode has one
 * step whose duration the browser will not disclose, and a render is one
 * `drawImage`. `total: null` says exactly that, and the interface above can
 * then show a spinner rather than a bar that lies.
 *
 * Generic over the stage names so each layer names its own steps without the
 * layer below having to know them.
 */
export interface StepProgress<Stage extends string> {
  stage: Stage;
  /** Units finished — bytes, attempts, passes. */
  loaded: number;
  /** Units in total, or null when the step cannot be counted ahead of time. */
  total: number | null;
}

export type StepReporter<Stage extends string> = (progress: StepProgress<Stage>) => void;

/**
 * A fraction in 0..1, or null when there is nothing to divide by.
 *
 * Clamped, because a `Content-Length` is a claim by a server rather than a
 * fact: a body longer than its header would otherwise report 140% done.
 */
export function progressRatio(loaded: number, total: number | null): number | null {
  if (total === null || !Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(loaded) || loaded < 0) return null;
  return Math.min(1, loaded / total);
}
