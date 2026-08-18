import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import { formatFindings, scanRepository, THIRD_PARTY_NAMES } from "../../scripts/independence-scan.mjs";

const root = new URL("../..", import.meta.url).pathname;

/**
 * The independence claim in the documentation is enforced here, so it fails in
 * CI the moment it stops being true rather than at a legal review.
 */
describe("independence", () => {
  it("keeps third-party product names, dependencies and vendored code out of the tree", () => {
    const findings = scanRepository(root);
    expect(formatFindings(findings)).toBe("independence scan: clean");
  });

  it("actually detects a name when one is present", () => {
    // Guards against the scan silently passing because its own pattern broke.
    const pattern = new RegExp(`(${THIRD_PARTY_NAMES.join("|")})`, "i");
    expect(pattern.test("we should just wrap CropperJS")).toBe(true);
    expect(pattern.test("we resize the crop rect")).toBe(false);
  });
});
