/**
 * Verification · Overview.
 *
 * The whole matrix in one place, and the rules it is written under. Every other
 * page in this section is one slice of the same data.
 */
import { COMPARISON_NOTE, ClaimTable, Scorecard } from "./table.js";
import { MARKET_REFERENCE, VERDICT_LABELS, claimsOf } from "./claim.js";
import { VERIFICATION } from "./matrix/index.js";
import { DataTable } from "../data-table.js";
import { note, panelTitle } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Overview",
} satisfies StoryDefault;

/** What each verdict is allowed to mean, which is the point of the whole section. */
const RULES: ReadonlyArray<{ verdict: keyof typeof VERDICT_LABELS; means: string }> = [
  {
    verdict: "met",
    means:
      "A requirement taken from the supplied material, which Pixen meets today. The evidence column names " +
      "the suite that fails if it stops meeting it.",
  },
  {
    verdict: "open",
    means:
      "A requirement taken from the supplied material, which Pixen does not meet yet. These are the gaps, " +
      "and they are on this page on purpose — a comparison with no losing rows is a brochure.",
  },
  {
    verdict: "declined",
    means:
      "A requirement Pixen deliberately does not meet, with the reason beside it. Not the same as a gap: " +
      "nobody is going to do it, and a page that said “open” about something nobody will do would be " +
      "promising a release that is not coming.",
  },
  {
    verdict: "beyond",
    means:
      "Pixen does this and no supplied requirement asked for it. A statement about our scope. It does not " +
      "say the comparison lacks it.",
  },
  {
    verdict: "unmeasured",
    means:
      "Pixen does this; whether the comparison does is not established here. Most rows are this, because " +
      "the material supplied covered some areas in detail and never mentioned others.",
  },
];

export const Summary: Story = () => (
  <section style={{ display: "grid", gap: 24, padding: "4px 2px 40px", maxWidth: 980 }}>
    <header style={{ display: "grid", gap: 8 }}>
      <h2 style={panelTitle}>Verification — {claimsOf(VERIFICATION).length} claims</h2>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>

    <Scorecard groups={VERIFICATION} />

    <section style={{ display: "grid", gap: 8 }}>
      <h3 style={panelTitle}>What a verdict may mean</h3>
      <p style={note}>
        There is deliberately no verdict meaning “they cannot do this”. Nothing in this repository could
        support one: we have read documentation supplied for this project, and we have not run{" "}
        {MARKET_REFERENCE}. Every verdict below is a statement about our own evidence.
      </p>
      <DataTable
        rows={RULES}
        keyOf={(rule) => rule.verdict}
        columns={[
          {
            header: "Verdict",
            cell: (rule) => VERDICT_LABELS[rule.verdict],
            style: { whiteSpace: "nowrap", fontWeight: 600 },
          },
          { header: "What it asserts", cell: (rule) => rule.means },
        ]}
      />
    </section>
  </section>
);

/** Every group, end to end, for a reader who wants the whole thing at once. */
export const Everything: Story = () => (
  <section style={{ display: "grid", gap: 20 }}>
    <header style={{ display: "grid", gap: 8, padding: "4px 2px 0" }}>
      <h2 style={panelTitle}>The whole matrix</h2>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>
    <ClaimTable groups={VERIFICATION} />
  </section>
);
