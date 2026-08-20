import { describe, expect, it } from "vitest";
import type { ProgressReport } from "@pixen/core";
import { BusyIndicator } from "../src/element/busy.js";
import { en, ko } from "../src/i18n/index.js";

function indicator(strings = () => en) {
  const pill = { hidden: false, textContent: "" } as HTMLElement;
  const changes: boolean[] = [];
  return { pill, changes, busy: new BusyIndicator({ pill, strings, changed: (b) => changes.push(b) }) };
}

const report: ProgressReport = { task: "export", stage: "encode", loaded: 1, total: 4, ratio: 0.25 };

describe("BusyIndicator", () => {
  it("hides the pill when there is nothing to say", () => {
    const { busy, pill } = indicator();
    busy.refresh();
    expect(pill.hidden).toBe(true);
    expect(busy.busy).toBe(false);
  });

  it("announces a change of busy-ness once at each end of a task", () => {
    const { busy, changes } = indicator();
    busy.begin("export");
    busy.report(report);
    busy.end();
    // Not on the progress in between: rebuilding the actions at the speed of a
    // download would take focus with it.
    expect(changes).toEqual([true, false]);
  });

  it("shows the task, then its measured progress", () => {
    const { busy, pill } = indicator();
    busy.begin("export");
    expect(pill.textContent).toBe("Exporting…");
    busy.report(report);
    expect(pill.textContent).toBe("Exporting… 25%");
  });

  it("drops a stale reading when the next task begins", () => {
    const { busy, pill } = indicator();
    busy.begin("export");
    busy.report(report);
    busy.begin("load");
    expect(pill.textContent).toBe("Loading…");
  });

  it("keeps a host's message over the picture after the editor's work ends", () => {
    const { busy, pill } = indicator();
    busy.status = "Sending to the service…";
    busy.begin("export");
    expect(pill.textContent).toBe("Sending to the service…");
    busy.end();
    expect(pill.hidden).toBe(false);
    busy.status = null;
    expect(pill.hidden).toBe(true);
  });

  it("treats an empty message as no message, which is what an attribute gives", () => {
    const { busy, pill } = indicator();
    busy.status = "";
    expect(busy.status).toBeNull();
    expect(pill.hidden).toBe(true);
  });

  it("reads its strings late, so a locale change mid-task reaches the pill", () => {
    let strings = en;
    const { busy, pill } = indicator(() => strings);
    busy.begin("load");
    expect(pill.textContent).toBe("Loading…");

    strings = ko;
    busy.refresh();
    expect(pill.textContent).toBe(ko.loading);
  });
});
