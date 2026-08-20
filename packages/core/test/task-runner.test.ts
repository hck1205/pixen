import { describe, expect, it, vi } from "vitest";
import { PixenError } from "../src/errors/index.js";
import { TaskRunner, type AbortReason, type ProgressReport } from "../src/engine/tasks/index.js";
import { progressRatio } from "../src/util/progress.js";

function spyHooks() {
  return {
    started: [] as unknown[],
    progress: [] as ProgressReport[],
    aborted: [] as AbortReason[],
    failed: [] as PixenError[],
  };
}

function runner<Start = void>(log = spyHooks()) {
  const task = new TaskRunner<Start>("load", {
    start: (detail) => log.started.push(detail),
    progress: (report) => log.progress.push(report),
    abort: (reason) => log.aborted.push(reason),
    fail: (error) => log.failed.push(error),
  });
  return { task, log };
}

const options = { code: "INVALID_IMAGE", message: "no" } as const;

describe("progressRatio", () => {
  it("is null when there is nothing to divide by", () => {
    expect(progressRatio(10, null)).toBeNull();
    expect(progressRatio(10, 0)).toBeNull();
    expect(progressRatio(10, Number.NaN)).toBeNull();
  });

  it("clamps, because a Content-Length is a claim rather than a fact", () => {
    expect(progressRatio(150, 100)).toBe(1);
  });

  it("divides when both numbers are real", () => {
    expect(progressRatio(25, 100)).toBe(0.25);
  });
});

describe("TaskRunner", () => {
  it("announces a start, then whatever the work reports", async () => {
    const { task, log } = runner<{ replace: boolean }>();

    await task.run({ replace: false }, options, async (attempt) => {
      attempt.report({ stage: "fetch", loaded: 50, total: 200 });
      attempt.report({ stage: "decode", loaded: 0, total: null });
    });

    expect(log.started).toEqual([{ replace: false }]);
    expect(log.progress).toEqual([
      { task: "load", stage: "fetch", loaded: 50, total: 200, ratio: 0.25 },
      { task: "load", stage: "decode", loaded: 0, total: null, ratio: null },
    ]);
    expect(log.failed).toEqual([]);
  });

  it("reports a failure once, on the error channel and to the caller", async () => {
    const { task, log } = runner();
    const boom = new PixenError("DECODE_FAILED", "broken");

    await expect(task.run(undefined, options, () => Promise.reject(boom))).rejects.toBe(boom);
    expect(log.failed).toEqual([boom]);
    expect(log.aborted).toEqual([]);
  });

  it("calls a cancellation an abort rather than a failure", async () => {
    const { task, log } = runner();
    const work = task.run(undefined, options, (attempt) =>
      new Promise((_resolve, reject) => {
        attempt.signal.addEventListener("abort", () => reject(new PixenError("ABORTED", "off")));
      }),
    );

    expect(task.cancel()).toBe(true);
    await expect(work).rejects.toThrow("off");
    expect(log.aborted).toEqual(["cancelled"]);
    // The whole point: a host that did not press cancel still hears nothing on
    // the error channel, because nothing went wrong.
    expect(log.failed).toEqual([]);
  });

  it("tells a supersession apart from a cancel", async () => {
    const { task, log } = runner();
    const first = task.run(undefined, options, (attempt) =>
      new Promise((_resolve, reject) => {
        attempt.signal.addEventListener("abort", () => reject(new PixenError("ABORTED", "off")));
      }),
    );
    const second = task.run(undefined, options, async () => "second");

    await expect(first).rejects.toThrow("off");
    await expect(second).resolves.toBe("second");
    expect(log.aborted).toEqual(["superseded"]);
  });

  it("drops progress from an attempt that has been superseded", async () => {
    const { task, log } = runner();
    let stale: ((progress: { stage: "decode"; loaded: number; total: null }) => void) | null = null;

    const first = task.run(undefined, options, (attempt) => {
      stale = attempt.report;
      return new Promise((_resolve, reject) => {
        attempt.signal.addEventListener("abort", () => reject(new PixenError("ABORTED", "off")));
      });
    });
    await task.run(undefined, options, async () => "second");
    await expect(first).rejects.toThrow("off");

    stale?.({ stage: "decode", loaded: 1, total: null });
    expect(log.progress).toEqual([]);
  });

  it("knows whether anything is in flight", async () => {
    const { task } = runner();
    expect(task.busy).toBe(false);
    expect(task.cancel()).toBe(false);

    const done = task.run(undefined, options, async () => {
      expect(task.busy).toBe(true);
    });
    await done;
    expect(task.busy).toBe(false);
  });

  it("chains a caller's own signal", async () => {
    const { task, log } = runner();
    const outside = new AbortController();
    const work = task.run(undefined, { ...options, signal: outside.signal }, (attempt) =>
      new Promise((_resolve, reject) => {
        attempt.signal.addEventListener("abort", () => reject(new PixenError("ABORTED", "off")));
      }),
    );

    outside.abort();
    await expect(work).rejects.toThrow("off");
    expect(log.aborted).toEqual(["cancelled"]);
  });

  it("wraps a failure that is not already a Pixen error", async () => {
    const { task, log } = runner();
    const fail = vi.fn(() => Promise.reject(new TypeError("nope")));

    await expect(task.run(undefined, options, fail)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(log.failed[0]?.code).toBe("INVALID_IMAGE");
  });
});
