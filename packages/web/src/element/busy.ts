import type { ProgressReport, ProgressTask } from "@pixen/core";
import { busyLabel } from "./busy-label.js";
import type { PixenStrings } from "../i18n/index.js";

/**
 * The pill over the picture, and the three things that decide what it says.
 *
 * State, an effect and nothing else — `busyLabel` next door holds the decision.
 * The element used to carry all three fields and the write to the DOM itself,
 * which meant "what is the editor doing" was four private fields deep in a
 * class about custom-element lifecycle.
 */
export interface BusyPorts {
  /** The node the label is written into. */
  pill: HTMLElement;
  /** Read late: the locale can change while a task is running. */
  strings(): PixenStrings;
  /**
   * A task started or finished. Progress reports do not call this: the actions
   * do not change while one task is running, and rebuilding them at the speed
   * of a download would take focus with it.
   */
  changed(busy: boolean): void;
}

export class BusyIndicator {
  readonly #ports: BusyPorts;
  #task: ProgressTask | null = null;
  #progress: ProgressReport | null = null;
  #status: string | null = null;

  constructor(ports: BusyPorts) {
    this.#ports = ports;
  }

  get busy(): boolean {
    return this.#task !== null;
  }

  get status(): string | null {
    return this.#status;
  }

  set status(value: string | null) {
    this.#status = value === "" ? null : value;
    this.refresh();
  }

  begin(task: ProgressTask): void {
    this.#task = task;
    this.#progress = null;
    this.#settled();
  }

  end(): void {
    this.#task = null;
    this.#progress = null;
    this.#settled();
  }

  /** The latest step report, or null when a task has just begun. */
  report(progress: ProgressReport | null): void {
    this.#progress = progress;
    this.refresh();
  }

  /** Re-reads the strings; the locale can change mid-task. */
  refresh(): void {
    const message = busyLabel(
      { status: this.#status, task: this.#task, progress: this.#progress },
      this.#ports.strings(),
    );
    this.#ports.pill.hidden = message === null;
    this.#ports.pill.textContent = message ?? "";
  }

  #settled(): void {
    this.refresh();
    this.#ports.changed(this.busy);
  }
}
