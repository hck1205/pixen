/**
 * Module-size budget.
 *
 * Not a cap on lines — CLAUDE.md is deliberate that a file is split when it
 * starts answering two questions, not when it passes a number, and this
 * repository has files that are long and right: a facade of one-line delegating
 * methods, a table of capabilities, a stylesheet.
 *
 * This is a tripwire. Crossing the budget means one of two things has to
 * happen: split the file, or write down why it is exempt. What it buys is that
 * "this one is fine" stops being a private judgement and becomes a recorded
 * one, with a reason the next reader can disagree with.
 *
 * A file that is exempt still cannot grow: its allowance is what it measured
 * when the exemption was written, so the exemption ages badly on purpose.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * How far under its allowance an exempt file may sit before the entry is asked
 * to come down. Wide enough that ordinary editing does not fail the check,
 * narrow enough that a split cannot be banked as future headroom.
 */
export const EXEMPT_SLACK = 16;

/** Past this, a source file has to justify itself. */
export const BUDGET = 300;

/**
 * Files over budget, with the reason and the size the reason was written at.
 *
 * Raising a number here is a decision. If a file needs more room, either it is
 * genuinely one concern that grew — say so — or it is two concerns and the
 * budget just told you.
 */
export const EXEMPT = {
  // The custom element: lifecycle, observed attributes, properties, the
  // imperative API and the wiring between them. Six concerns have been
  // extracted out of it — on-canvas text editing, sticker placement, every way
  // an image arrives, what each attribute means, what the engine's events do,
  // and the busy pill — and what is left is the element itself.
  "packages/web/src/element/pixen-image-editor.ts": 731,
  // The public imperative API: very nearly one line per method, each building
  // an intent and handing it to `dispatch`. Splitting it would scatter the
  // surface a host reads as one thing, and the decisions are already elsewhere.
  "packages/core/src/engine/editor.ts": 728,
  // Pointer plumbing over gesture functions that are pure and tested next
  // door. The class holds state, effects and subscribers, which is what the
  // working agreement says a class is for.
  "packages/web/src/viewport/viewport.ts": 488,
  // Every document mutation as a pure function, one per operation. The list is
  // long because the vocabulary is; each entry is a handful of lines.
  "packages/core/src/engine/commands.ts": 333,
};

const SOURCE = /^(packages|apps)\/[^/]+\/src\/.*\.tsx?$/;

/**
 * Measures what git tracks, then hands it to the decision below.
 *
 * `options.sizes` and `options.exempt` replace the measuring and the recorded
 * reasons, so the rules can be tested without planting files in the repository
 * — the same seam `duplicate-blocks.mjs` has, for the same reason.
 */
export function scanModuleBudget(root = process.cwd(), options = {}) {
  const budget = options.budget ?? BUDGET;
  const exempt = options.exempt ?? EXEMPT;
  const sizes = options.sizes ?? measureTrackedSources(root);

  const findings = [];
  for (const [file, lines] of sizes) {
    const allowance = exempt[file];
    if (allowance === undefined) {
      if (lines > budget) findings.push({ file, lines, allowance: budget, exempt: false });
    } else if (lines > allowance) {
      findings.push({ file, lines, allowance, exempt: true });
    }
  }

  const stale = [];
  const slack = [];
  for (const [file, allowance] of Object.entries(exempt)) {
    const lines = sizes.get(file);
    // An exemption for a file that is gone, or now comfortably inside the
    // budget, is a note nobody needs, and it hides the next file that grows
    // into its place.
    if (lines === undefined || lines <= budget) {
      stale.push(file);
      continue;
    }
    // Still over the budget, but well under what it was exempted at. The
    // allowance is the size the reason was written at; a file that has since
    // been split hands the difference back rather than keeping it as room to
    // grow into. The tolerance is there so ordinary editing does not fail.
    if (lines < allowance - EXEMPT_SLACK) slack.push({ file, lines, allowance });
  }

  return { findings: findings.sort((a, b) => b.lines - a.lines), stale, slack };
}

function measureTrackedSources(root) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => SOURCE.test(file));

  const sizes = new Map();
  for (const file of files) {
    try {
      sizes.set(file, readFileSync(`${root}/${file}`, "utf8").split("\n").length);
    } catch {
      // A tracked file that cannot be read cannot be measured against anything.
    }
  }
  return sizes;
}

export function formatBudget({ findings, stale, slack = [] }) {
  if (findings.length === 0 && stale.length === 0 && slack.length === 0) return "module-budget scan: clean";

  const over = findings.map((finding) =>
    finding.exempt
      ? `${finding.file}: ${finding.lines} lines, past its ${finding.allowance}-line exemption`
      : `${finding.file}: ${finding.lines} lines, over the ${finding.allowance}-line budget`,
  );
  const unused = stale.map((file) => `${file}: exempt, but no longer over budget — drop the entry`);
  const loose = slack.map(
    ({ file, lines, allowance }) => `${file}: exempt at ${allowance}, now ${lines} lines — lower the entry to ${lines}`,
  );
  return [...over, ...unused, ...loose].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = scanModuleBudget(process.cwd());
  console.log(formatBudget(result));
  if (result.findings.length > 0 || result.stale.length > 0 || result.slack.length > 0) {
    console.log("\nSplit the file, or record why it is one concern in EXEMPT.");
    process.exit(1);
  }
}
