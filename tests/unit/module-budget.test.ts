import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import { BUDGET, EXEMPT, EXEMPT_SLACK, formatBudget, scanModuleBudget } from "../../scripts/module-budget.mjs";

const root = new URL("../..", import.meta.url).pathname;

/**
 * The budget is a tripwire, not a cap: a file over it is either split or
 * written down as one concern that grew. This keeps that decision recorded
 * rather than private, and keeps an exemption from quietly becoming a licence
 * to keep growing.
 */
describe("module budget", () => {
  it("finds nothing over budget or over its exemption", () => {
    expect(formatBudget(scanModuleBudget(root))).toBe("module-budget scan: clean");
  });

  it("keeps the exemption list short enough that every reason is read", () => {
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(8);
  });

  it("asks an exemption to come down once the file it covers has been split", () => {
    // The allowance is the size the reason was written at. A file that shrinks
    // hands the difference back, or the split quietly becomes room to grow into.
    const options = { exempt: { "big.ts": 800 } };
    const split = scanModuleBudget(root, { ...options, sizes: new Map([["big.ts", 500]]) });

    expect(split.slack).toEqual([{ file: "big.ts", lines: 500, allowance: 800 }]);
    expect(formatBudget(split)).toBe("big.ts: exempt at 800, now 500 lines — lower the entry to 500");
  });

  it("leaves room for ordinary editing rather than failing on one deleted line", () => {
    const edited = scanModuleBudget(root, {
      exempt: { "big.ts": 800 },
      sizes: new Map([["big.ts", 800 - EXEMPT_SLACK]]),
    });
    expect(edited.slack).toEqual([]);
    expect(formatBudget(edited)).toBe("module-budget scan: clean");
  });

  it("calls an exemption stale once its file is back inside the budget", () => {
    const shrunk = scanModuleBudget(root, {
      exempt: { "big.ts": 800 },
      sizes: new Map([["big.ts", BUDGET]]),
    });
    // Stale rather than slack: there is nothing left to be exempt from.
    expect(shrunk.stale).toEqual(["big.ts"]);
    expect(shrunk.slack).toEqual([]);
  });

  it("holds every exemption above the budget it is exempt from", () => {
    // An exemption at or under the budget is a note nobody needs; the scan
    // reports those separately, and this catches one written by mistake.
    for (const [file, allowance] of Object.entries(EXEMPT)) {
      expect(allowance, file).toBeGreaterThan(BUDGET);
    }
  });
});
