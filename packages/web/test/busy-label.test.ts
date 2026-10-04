import { describe, expect, it } from "vitest";
import type { ProgressReport } from "@pixen/core";
import { busyLabel } from "../src/element/busy-label.js";
import { en } from "../src/i18n/en.js";

const idle = { status: null, task: null, progress: null } as const;

function report(over: Partial<ProgressReport> = {}): ProgressReport {
  return { task: "load", stage: "fetch", loaded: 25, total: 100, ratio: 0.25, ...over };
}

describe("busyLabel", () => {
  it("says nothing when nothing is happening", () => {
    expect(busyLabel(idle, en)).toBeNull();
  });

  it("lets a host's own message win, because it is the more specific one", () => {
    expect(busyLabel({ ...idle, status: "Removing background", task: "export" }, en)).toBe("Removing background");
  });

  it("names the task when there is no number to show", () => {
    expect(busyLabel({ ...idle, task: "load" }, en)).toBe("Loading…");
    expect(busyLabel({ ...idle, task: "export" }, en)).toBe("Exporting…");
  });

  it("shows a percentage only when the step actually counted something", () => {
    expect(busyLabel({ ...idle, task: "load", progress: report() }, en)).toBe("Loading… 25%");
    expect(busyLabel({ ...idle, task: "load", progress: report({ ratio: null, total: null }) }, en)).toBe("Loading…");
  });

  it("ignores a report left over from the other task", () => {
    const stale = report({ task: "load", ratio: 0.9 });
    expect(busyLabel({ ...idle, task: "export", progress: stale }, en)).toBe("Exporting…");
  });

  it("rounds rather than showing a reader six decimal places", () => {
    expect(busyLabel({ ...idle, task: "export", progress: report({ task: "export", ratio: 0.6666 }) }, en)).toBe(
      "Exporting… 67%",
    );
  });
});
