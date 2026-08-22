/**
 * What a verification claim is, and what may be said about the comparison.
 *
 * The coverage page answers "what does Pixen do". This section answers the
 * harder question a buyer actually asks — "how does it compare" — and the whole
 * difficulty is that half of that question is about somebody else's product,
 * which we cannot test and must not guess about.
 *
 * So every verdict here is a statement about *our own* evidence. `met` and
 * `open` are about requirements taken from the documentation supplied for this
 * project; `beyond` is about our scope, not theirs; and `unmeasured` says
 * plainly that nothing here establishes what the comparison does. There is
 * deliberately no verdict that means "they cannot do this", because nothing in
 * this repository could support one.
 *
 * The Evidence vocabulary is the coverage page's, imported rather than
 * repeated: a claim proved by a suite here is proved by the same suite there.
 */
import type { Evidence } from "../coverage/evidence.js";

export type { Evidence };
export { browser, doc, list, story, unit, visual, evidenceLabel } from "../coverage/evidence.js";

/**
 * Who Pixen is measured against.
 *
 * Named in one place, and not by name. `scripts/independence-scan.mjs` fails
 * the build on a competitor's name appearing in any tracked file — that tripwire
 * is the mechanical half of the independence claim, and a comparison table is
 * not a good reason to be the first exception to it. Whoever reads this page
 * knows which product they are comparing against; the file does not have to.
 */
export const MARKET_REFERENCE = "the market comparison";

/**
 * Where a statement about the comparison came from.
 *
 * One kind, on purpose. Every such statement in this section is derived from
 * documentation the customer supplied for this project, read for its functional
 * requirements and written down in our own words — which is the same method
 * `docs/PROVENANCE.md` records for everything else. The topic says which part
 * of that material a row came from, so a reader can ask for it.
 */
export interface MarketSource {
  kind: "supplied-doc";
  topic: string;
}

export interface MarketClaim {
  /** The requirement, in our words. Never a quotation. */
  detail: string;
  source: MarketSource;
}

/**
 * A verdict is about our evidence, never about their product.
 *
 * - `met` — a requirement from the supplied material that Pixen meets today.
 * - `open` — a requirement from the supplied material that Pixen does not meet
 *   yet. These are the honest gaps, and they are on this page on purpose.
 * - `beyond` — Pixen does this and no supplied requirement asked for it. A
 *   statement about our scope. It does not say the comparison lacks it.
 * - `unmeasured` — Pixen does this; whether the comparison does is not
 *   established here. Most rows are this, and that is the honest answer.
 */
export type Verdict = "met" | "open" | "beyond" | "unmeasured";

export const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  met: "Requirement met",
  open: "Requirement open",
  beyond: "Beyond the brief",
  unmeasured: "Not measured against",
};

export const VERDICT_ORDER: readonly Verdict[] = ["open", "met", "beyond", "unmeasured"];

export interface Claim {
  capability: string;
  /** What Pixen does today. Derived from the code wherever the code has a list. */
  pixen: string;
  verdict: Verdict;
  /** The requirement this answers, when there is one. Required for met and open. */
  market?: MarketClaim;
  /** What fails if the Pixen half stops being true. Never empty. */
  evidence: Evidence[];
  /** The difference worth knowing about, when there is one. */
  note?: string;
}

export interface ClaimGroup {
  title: string;
  summary: string;
  claims: Claim[];
}

/** A requirement taken from the supplied material, in our own words. */
export const required = (topic: string, detail: string): MarketClaim => ({
  detail,
  source: { kind: "supplied-doc", topic },
});

export function claimsOf(groups: readonly ClaimGroup[]): Claim[] {
  return groups.flatMap((group) => group.claims);
}

export function countVerdicts(groups: readonly ClaimGroup[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { met: 0, open: 0, beyond: 0, unmeasured: 0 };
  for (const claim of claimsOf(groups)) counts[claim.verdict] += 1;
  return counts;
}
