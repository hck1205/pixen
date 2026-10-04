import { toPixenError, type PixenError, type PixenErrorCode } from "../../errors/index.js";
import { chainAbort } from "../../util/abort.js";
import type { StepProgress, StepReporter } from "../../util/progress.js";
import { progressReport, type ProgressReport, type ProgressStage, type ProgressTask } from "./progress.js";

/**
 * Why a task stopped early.
 *
 * A host that called `cancelExport` already knows it did; what it cannot
 * otherwise know is that its export was called off by a *second* export. The
 * two are told apart so an interface can ignore the one it caused.
 */
export type AbortReason = "cancelled" | "superseded";

/** The abort reason a supersession carries, so the loser can recognise itself. */
const SUPERSEDED = Symbol("pixen.superseded");

export interface TaskHooks<Start> {
  start(detail: Start): void;
  progress(report: ProgressReport): void;
  abort(reason: AbortReason): void;
  fail(error: PixenError): void;
}

/** What the work being run is handed: how to stop, and how to say where it is. */
export interface TaskAttempt {
  readonly signal: AbortSignal;
  report(progress: StepProgress<ProgressStage>): void;
}

export interface TaskOptions {
  /** A caller's own signal, chained with the runner's. */
  signal?: AbortSignal;
  code: PixenErrorCode;
  message: string;
}

/**
 * One long-running editor task: its cancellation, its progress and its ending.
 *
 * Load and export are the same shape — start it, report on it, let someone call
 * it off, announce whichever way it ended — and were previously two hand-rolled
 * copies of that shape with only the error message differing. Holding it once
 * is what makes an abort observable at all: the previous copies swallowed the
 * cancellation into a generic error, so a listener that did not initiate the
 * cancel could not tell it from a corrupt file.
 */
export class TaskRunner<Start = void> {
  readonly task: ProgressTask;
  readonly #hooks: TaskHooks<Start>;
  #current: AbortController | null = null;

  constructor(task: ProgressTask, hooks: TaskHooks<Start>) {
    this.task = task;
    this.#hooks = hooks;
  }

  get busy(): boolean {
    return this.#current !== null;
  }

  /** Calls off whatever is in flight. True when there was something. */
  cancel(): boolean {
    if (!this.#current) return false;
    this.#current.abort();
    this.#current = null;
    return true;
  }

  async run<T>(detail: Start, options: TaskOptions, work: (attempt: TaskAttempt) => Promise<T>): Promise<T> {
    // Only one of each task is ever in flight: starting a second calls off the
    // first, so a host that changes its mind twice does not race two decodes
    // into the same editor and get whichever happened to finish last.
    this.#current?.abort(SUPERSEDED);
    const controller = chainAbort(options.signal);
    this.#current = controller;
    this.#hooks.start(detail);

    try {
      return await work({
        signal: controller.signal,
        report: (progress) => {
          // A superseded attempt keeps running until its awaits unwind. Its
          // progress is about work nobody is waiting for any more.
          if (this.#current === controller) this.#hooks.progress(progressReport(this.task, progress));
        },
      });
    } catch (cause) {
      const error = toPixenError(cause, options.code, options.message);
      // Being called off is not a failure, and reporting it as one makes every
      // host filter error codes to keep a cancel from looking like a crash.
      if (error.code === "ABORTED" || controller.signal.aborted) {
        this.#hooks.abort(controller.signal.reason === SUPERSEDED ? "superseded" : "cancelled");
      } else {
        this.#hooks.fail(error);
      }
      throw error;
    } finally {
      if (this.#current === controller) this.#current = null;
    }
  }
}

/**
 * Points a caller's options at this attempt: its signal, its progress channel.
 *
 * Every task hands the same two things down to the work it delegates to, and
 * the third copy of `{ ...options, signal, onProgress }` was the one that
 * proved it wanted a name.
 */
export function tracked<T extends object>(
  options: T,
  attempt: TaskAttempt,
): T & { signal: AbortSignal; onProgress: StepReporter<ProgressStage> } {
  return { ...options, signal: attempt.signal, onProgress: attempt.report };
}
