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
  // imperative API and the wiring between them. Seven concerns have been
  // extracted out of it — on-canvas text editing, sticker placement, every way
  // an image arrives, what each attribute means, what the engine's events do,
  // the busy pill, and the three operations that take time — and what is left
  // is the element itself. The one line over the split's own count is the port
  // that hands the crop tool's configured ratio to the load.
  "packages/web/src/element/pixen-image-editor.ts": 699,
  // The public imperative API: very nearly one line per method, each building
  // an intent and handing it to `dispatch`. Splitting it would scatter the
  // surface a host reads as one thing, and the decisions are already elsewhere.
  //
  // Raised from 728 to fix a bug, which is a decision and not a licence.
  // `commitTransaction` answered "did that gesture change anything" by watching
  // the history depth, which saturates once the stack is full, so every gesture
  // after the hundredth reported that nothing had happened. Getting the answer
  // from the reducer needs `dispatch` to hand its outcome back, which is the
  // thirteen lines. I looked for a split first: the export methods are the only
  // part that is not a one-line delegation, and moving them leaves the class the
  // same size because the methods have to stay. Commonising the two lines
  // `export` and `exportTo` share cost two more than it saved.
  // A facade of delegations: the six ways a picture leaves the editor moved to
  // `EditorOutputs`, and what is left is one line per public call plus the
  // state a class is for. The last eight are `replacePreview`, which is the
  // one call that is not a delegation — it touches the resources and the event
  // channel, and both of those live here.
  //
  // Raised from 755 for `measureText`: a second injected capability beside the
  // resource manager, without which the engine estimates how wide a caption is
  // and a text layer resizes about a box that is not around its letters. A
  // field, an option, an import and the paragraph saying why.
  //
  // Raised again from 769 for named history steps: `transact` and
  // `beginTransaction` take a `StepLabel` rather than a bare string, so a step
  // the engine performs can be worded in the reader's own language, and the
  // paragraph on `dispatchAll` says which of the two its argument is.
  //
  // Raised from 772 for `#markFrame`: a watermark's position and scale are
  // fractions of the frame it belongs to, and a mark on the exported frame has
  // to be measured against that rather than against the picture — otherwise a
  // corner mark on a heavily cropped photograph lands outside it.
  //
  // Raised from 785 for `setCropWithinImage`: one more delegation, and the
  // paragraph saying that turning the rule back on brings an overhanging crop
  // home rather than leaving the document in a state its own rule forbids.
  "packages/core/src/engine/editor.ts": 795,
  // Pointer plumbing over gesture functions that are pure and tested next
  // door, plus the render loop. The class holds state, effects and subscribers,
  // which is what the working agreement says a class is for; the overlay's
  // decision, its drawing and the multi-touch bookkeeping have all been lifted
  // out of it, and the overlay it draws is now a folder it reaches through one
  // import rather than two. The measurer it hands the engine is here because it
  // owns the canvas, so it is the only part that can.
  "packages/web/src/viewport/viewport.ts": 464,
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
