import type { ProgressReport, ProgressTask } from "@pixen/core";
import type { PixenStrings } from "../i18n/index.js";

/** Rounded percentages, because a pill is not a progress bar. */
const PERCENT = 100;

export interface BusyState {
  /** A host-supplied message. It wins: it is the more specific thing to say. */
  status: string | null;
  /** What the editor is doing, or null when it is doing nothing. */
  task: ProgressTask | null;
  /** The most recent step report, whichever task it came from. */
  progress: ProgressReport | null;
}

/**
 * What the busy pill says, or null when there is nothing to say.
 *
 * A percentage appears only when the current step actually counted something.
 * Most steps cannot — a decode is one call into the browser — and the pill then
 * reads as a plain "Loading…" rather than a number nobody measured. That is the
 * whole reason `ProgressReport.ratio` is nullable: a bar that invents its own
 * position is worse than no bar, because a reader believes it.
 */
export function busyLabel(state: BusyState, strings: PixenStrings): string | null {
  if (state.status) return state.status;
  if (!state.task) return null;

  const label = state.task === "load" ? strings.loading : strings.exporting;
  const { progress } = state;
  // A report left over from the previous task says nothing about this one.
  if (!progress || progress.task !== state.task || progress.ratio === null) return label;

  return `${label} ${Math.round(progress.ratio * PERCENT)}%`;
}
