/**
 * Verification · Overview.
 *
 * The whole matrix in one place, and the rules it is written under. Every other
 * page in this section is one slice of the same data.
 */
import { COMPARISON_NOTE, ClaimTable, Scorecard } from "./table.js";
import { MARKET_REFERENCE, VERDICT_LABELS, claimsOf } from "./claim.js";
import { VERIFICATION } from "./matrix/index.js";
import { note, panelTitle, table, tableCell, tableHeader } from "../styles.js";
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
      <table style={table}>
        <thead>
          <tr>
            <th style={tableHeader}>Verdict</th>
            <th style={tableHeader}>What it asserts</th>
          </tr>
        </thead>
        <tbody>
          {RULES.map((rule) => (
            <tr key={rule.verdict}>
              <td style={{ ...tableCell, whiteSpace: "nowrap", fontWeight: 600 }}>
                {VERDICT_LABELS[rule.verdict]}
              </td>
              <td style={tableCell}>{rule.means}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
