import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, browserTestFiles, storyNames, unitTestFiles } from "./evidence-files.js";
import { VERIFICATION } from "../../apps/stories/src/verification/matrix/index.js";
import { claimsOf, countVerdicts, evidenceLabel } from "../../apps/stories/src/verification/claim.js";
import { THIRD_PARTY_NAMES } from "../../scripts/independence-scan.mjs";

/**
 * The verification section compares Pixen against something we cannot run.
 *
 * That makes it the easiest page in the repository to get quietly wrong, in two
 * different ways: by claiming something about Pixen that stopped being true,
 * and by claiming something about the comparison that nobody can source. Both
 * are checked here.
 *
 * The rule that matters most is the last one. A verdict of `met` or `open` says
 * a requirement was taken from material supplied for this project, so it has to
 * name where it came from — and a verdict that says nothing about the
 * comparison must not smuggle one in through the market column.
 */

const units = unitTestFiles();
const stories = storyNames();
const browserTests = browserTestFiles();
const claims = claimsOf(VERIFICATION);

describe("the verification matrix", () => {
  it("covers the whole product", () => {
    expect(claims.length).toBeGreaterThan(50);
    expect(VERIFICATION.length).toBeGreaterThan(6);
  });

  it("names every capability once", () => {
    const names = claims.map((claim) => claim.capability);
    expect(new Set(names).size).toBe(names.length);
  });

  it("says what Pixen does in every row", () => {
    expect(claims.filter((claim) => claim.pixen.trim() === "").map((claim) => claim.capability)).toEqual([]);
  });

  it("backs every row with evidence", () => {
    expect(claims.filter((claim) => claim.evidence.length === 0).map((claim) => claim.capability)).toEqual([]);
  });

  it("keeps the rows that are not wins, because a comparison without them is a brochure", () => {
    const counts = countVerdicts(VERIFICATION);
    expect(counts.open + counts.declined).toBeGreaterThan(0);
  });
});

describe("what a verdict is allowed to assert", () => {
  it("sources every requirement it says was asked for", () => {
    const unsourced = claims
      .filter((claim) => claim.verdict === "met" || claim.verdict === "open" || claim.verdict === "declined")
      .filter((claim) => !claim.market?.source.topic || claim.market.detail.trim() === "")
      .map((claim) => claim.capability);
    expect(unsourced).toEqual([]);
  });

  it("states no requirement on a row that claims none", () => {
    // `beyond` and `unmeasured` say nothing about the comparison. A market cell
    // on one of them would be a claim about somebody else's product with no
    // verdict standing behind it.
    const smuggled = claims
      .filter((claim) => claim.verdict === "beyond" || claim.verdict === "unmeasured")
      .filter((claim) => claim.market !== undefined)
      .map((claim) => claim.capability);
    expect(smuggled).toEqual([]);
  });

  it("names nobody, which is the rule the whole repository is written under", () => {
    // `check:independence` scans tracked files, so it would catch this too. It
    // is checked here as well because this is the one page in the repository
    // whose subject is a competitor, and the first place a name would be typed.
    const pattern = new RegExp(`(${THIRD_PARTY_NAMES.join("|")})`, "i");
    const everyString = [
      ...VERIFICATION.flatMap((group) => [group.title, group.summary]),
      ...claims.flatMap((claim) => [
        claim.capability,
        claim.pixen,
        claim.note ?? "",
        claim.market?.detail ?? "",
        claim.market?.source.topic ?? "",
      ]),
    ];
    expect(everyString.filter((text) => pattern.test(text))).toEqual([]);
  });
});

describe("the evidence", () => {
  it("names unit tests that exist", () => {
    const missing = claims.flatMap((claim) =>
      claim.evidence
        .filter((evidence) => evidence.kind === "unit" && !units.has(evidence.file))
        .map((evidence) => `${claim.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });

  it("names browser and visual specs that exist", () => {
    const missing = claims.flatMap((claim) =>
      claim.evidence
        .filter(
          (evidence) =>
            (evidence.kind === "browser" || evidence.kind === "visual") && !browserTests.has(evidence.file),
        )
        .map((evidence) => `${claim.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });

  it("names stories that exist", () => {
    const missing = claims.flatMap((claim) =>
      claim.evidence
        .filter((evidence) => evidence.kind === "story" && !stories.has(evidence.name))
        .map((evidence) => `${claim.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });

  it("names documents that exist", () => {
    const missing = claims.flatMap((claim) =>
      claim.evidence
        .filter((evidence) => evidence.kind === "doc" && !existsSync(`${ROOT}${evidence.file}`))
        .map((evidence) => `${claim.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });
});
