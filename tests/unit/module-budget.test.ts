import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import { BUDGET, EXEMPT, formatBudget, scanModuleBudget } from "../../scripts/module-budget.mjs";

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

  it("holds every exemption above the budget it is exempt from", () => {
    // An exemption at or under the budget is a note nobody needs; the scan
    // reports those separately, and this catches one written by mistake.
    for (const [file, allowance] of Object.entries(EXEMPT)) {
      expect(allowance, file).toBeGreaterThan(BUDGET);
    }
  });
});
