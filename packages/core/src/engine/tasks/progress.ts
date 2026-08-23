import type { DecodeStage } from "../../image/decode.js";
import type { ExportStage } from "../../export/options.js";
import { progressRatio, type StepProgress } from "../../util/progress.js";

/** The two things the editor does that are worth waiting for. */
export type ProgressTask = "load" | "export";

/**
 * Every step either task can be in.
 *
 * Owned by the layers that perform them — the decoder names its stages, the
 * export pipeline names its own — so adding a step is a change in one place.
 */
export type ProgressStage = DecodeStage | ExportStage;

export interface ProgressReport extends StepProgress<ProgressStage> {
  task: ProgressTask;
  /**
   * 0..1, or null when this step has no countable units.
   *
   * There is deliberately no separate `lengthComputable` flag: it would be a
   * second name for `ratio !== null`, and two names for one fact eventually
   * disagree.
   */
  ratio: number | null;
}

export function progressReport(task: ProgressTask, progress: StepProgress<ProgressStage>): ProgressReport {
  return { task, ...progress, ratio: progressRatio(progress.loaded, progress.total) };
}
