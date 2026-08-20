/**
 * Duplicate-block scan.
 *
 * "Commonise the third occurrence" is the rule in CLAUDE.md, and until now it
 * was enforced by reading — which found plenty, and also let a duplicate of my
 * own survive a whole pass before the next one caught it. This finds them
 * mechanically, so the rule is a check rather than a habit.
 *
 * What counts as the same block: the same sequence of `MIN_LINES` meaningful
 * lines, compared after comments and whitespace are normalised away. Identifiers
 * are *not* normalised — two blocks that differ only in a variable name are a
 * different judgement call, and reporting them would bury the real ones.
 *
 * Two occurrences are allowed on purpose: the rule says the third is the one to
 * act on, and abstracting the first similarity is its own mistake.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Long enough to be a decision worth naming, short enough to catch the real
 * ones. Tuned by running it: at three lines everything is import boilerplate
 * and closing tags, at five the known clones this repository has actually
 * shipped would have slipped through.
 */
export const MIN_LINES = 4;

/** The rule's threshold: two can wait, three is a shared module. */
export const MAX_OCCURRENCES = 2;

/**
 * Repetition that is the point rather than a smell, each with its reason.
 *
 * An entry is a substring, matched against the block's text and against the
 * paths it was found in. Keep this list short — every entry is duplication
 * somebody decided to live with.
 */
export const ACCEPTED_DUPLICATION = [
  // The nine locales are the same keys with different values by definition.
  // Their sameness is what `i18n.test.ts` asserts, not something to remove.
  "packages/web/src/i18n/",
  // Every story file declares the same title on purpose: that is what keeps a
  // story's id stable when stories are moved between files, which the visual
  // baselines depend on. Sharing it would mean a module that exists to hold
  // four lines of framework boilerplate.
  "satisfies StoryDefault",
];

const SOURCE = /^(packages|apps)\/[^/]+\/src\/.*\.tsx?$/;

/** Lines that carry no decision, so a run of them is not a duplicated block. */
const TRIVIAL = /^([)\]}>;,]+|else\s*{|try\s*{|return;|break;|continue;|\/\/.*|)$/;

/**
 * Strips what should not decide whether two blocks are the same: comments,
 * indentation and the width of the gaps between tokens.
 */
function normalise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim().replace(/\s+/g, " "));
}

/**
 * Reads what git tracks, then hands it to the decision below.
 *
 * `options.files` replaces the reading, so the finder can be tested without
 * planting files in the repository — the same split this script exists to
 * enforce.
 */
export function scanDuplicateBlocks(root = process.cwd(), options = {}) {
  const sources = options.files ?? readTrackedSources(root);
  return findDuplicateBlocks(sources, options);
}

function readTrackedSources(root) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => SOURCE.test(file));

  const sources = [];
  for (const file of files) {
    try {
      sources.push({ file, source: readFileSync(`${root}/${file}`, "utf8") });
    } catch {
      // A tracked file that cannot be read cannot hide a clone worth reporting.
    }
  }
  return sources;
}

/** The decision: which blocks appear in more places than the rule allows. */
export function findDuplicateBlocks(sources, options = {}) {
  const minLines = options.minLines ?? MIN_LINES;

  // Every window of `minLines` meaningful lines, keyed by its text.
  const windows = new Map();

  for (const { file, source } of sources) {
    // Meaningful lines only, but remembering where each came from, so a report
    // points at a line number a person can open.
    const meaningful = [];
    for (const [index, text] of normalise(source).entries()) {
      if (!TRIVIAL.test(text)) meaningful.push({ text, line: index + 1 });
    }

    for (let start = 0; start + minLines <= meaningful.length; start += 1) {
      const block = meaningful.slice(start, start + minLines);
      const key = block.map((entry) => entry.text).join("\n");
      const found = windows.get(key) ?? [];
      // One window per file per block: a block repeated inside a file is one
      // finding, not one per overlapping window.
      if (!found.some((entry) => entry.file === file)) {
        found.push({ file, line: block[0].line });
        windows.set(key, found);
      }
    }
  }

  const accepted = (key, places) =>
    ACCEPTED_DUPLICATION.some(
      (entry) => key.includes(entry) || places.every((place) => place.file.includes(entry)),
    );

  const findings = [...windows.entries()]
    .filter(([, places]) => places.length > MAX_OCCURRENCES)
    .filter(([key, places]) => !accepted(key, places))
    .map(([key, places]) => ({ places, lines: key.split("\n") }));

  return mergeOverlapping(findings, minLines).sort((a, b) => b.places.length - a.places.length);
}

/**
 * One clone, one finding.
 *
 * A twelve-line clone is eight overlapping four-line windows, and reporting all
 * eight says the same thing eight times. Windows over the same set of files
 * whose starts step by one are the same region seen through a sliding frame, so
 * they collapse into the first, with the length it really has.
 */
function mergeOverlapping(findings, minLines) {
  const groups = new Map();
  for (const finding of findings) {
    const key = finding.places.map((place) => place.file).sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }

  const merged = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.places[0].line - b.places[0].line);
    let run = null;

    for (const finding of sorted) {
      const followsOn =
        run !== null &&
        finding.places.every((place, index) => place.line === run.places[index].line + run.length);

      if (followsOn) {
        run.length += 1;
        continue;
      }
      if (run) merged.push({ places: run.places, lines: run.lines, length: run.length + minLines - 1 });
      run = { places: finding.places, lines: finding.lines, length: 1 };
    }
    if (run) merged.push({ places: run.places, lines: run.lines, length: run.length + minLines - 1 });
  }
  return merged;
}

export function formatDuplicates(findings) {
  if (findings.length === 0) return "duplicate-block scan: clean";
  return findings
    .map((finding) => {
      const where = finding.places.map((place) => `${place.file}:${place.line}`).join("\n    ");
      return `${finding.places.length} copies of ${finding.length} lines:\n    ${where}\n      | ${finding.lines[0]}`;
    })
    .join("\n\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanDuplicateBlocks(process.cwd());
  console.log(formatDuplicates(findings));
  if (findings.length > 0) {
    console.log(
      `\n${findings.length} duplicated block(s). Commonise them, or add a reason to ACCEPTED_DUPLICATION.`,
    );
    process.exit(1);
  }
}
