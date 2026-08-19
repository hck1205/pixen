import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import { formatFindings, INTENTIONAL_PUBLIC_API, scanUnusedExports } from "../../scripts/unused-exports.mjs";

const root = new URL("../..", import.meta.url).pathname;

/**
 * "Delete rather than deprecate" only holds if something notices. This makes an
 * export with no caller a failing test rather than a slow accumulation.
 */
describe("unused exports", () => {
  it("finds none outside the documented public seams", () => {
    expect(formatFindings(scanUnusedExports(root))).toBe("unused-export scan: clean");
  });

  it("keeps the allowlist short enough to read", () => {
    expect(INTENTIONAL_PUBLIC_API.size).toBeLessThanOrEqual(5);
  });
});
