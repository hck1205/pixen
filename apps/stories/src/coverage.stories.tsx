/**
 * The coverage table: what Pixen does, read out of Pixen.
 *
 * Its own file because it is its own thing — every other story here drives the
 * editor, and this one reads the codebase. The title matches the rest, so the
 * story keeps its id.
 */
import { COVERAGE, coverageCount, evidenceLabel } from "./coverage.js";
import { capabilityCell, evidenceCell, note, panelTitle, tableCell, tableHeader, wideTable } from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Editor",
} satisfies StoryDefault;

/**
 * The verification table.
 *
 * Every capability, what it is today, and what proves it. The detail column is
 * derived from the exports that define each set, and `coverage.test.ts` checks
 * that every file and story named here exists — so this page cannot quietly
 * claim something the codebase stopped doing.
 */
export const Coverage: Story = () => (
  <section style={{ display: "grid", gap: 28, padding: "4px 2px 40px" }}>
    <header style={{ display: "grid", gap: 6 }}>
      <h2 style={panelTitle}>Coverage — {coverageCount()} capabilities</h2>
      <p style={note}>
        What Pixen does, read out of Pixen. Where a capability is a set of things, the detail column is
        generated from the export that defines them; the evidence column names the suite that fails if the
        capability stops working, and a unit test checks that every one of those files and stories exists.
      </p>
    </header>

    {COVERAGE.map((group) => (
      <section key={group.title} style={{ display: "grid", gap: 8 }}>
        <h3 style={panelTitle}>{group.title}</h3>
        <p style={note}>{group.summary}</p>
        <table style={wideTable}>
          <thead>
            <tr>
              <th style={tableHeader}>Capability</th>
              <th style={tableHeader}>Layer</th>
              <th style={tableHeader}>What it is</th>
              <th style={tableHeader}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {group.entries.map((entry) => (
              <tr key={entry.capability}>
                <td style={capabilityCell}>{entry.capability}</td>
                <td style={{ ...tableCell, opacity: 0.7 }}>{entry.layer}</td>
                <td style={tableCell}>{entry.detail}</td>
                <td style={evidenceCell}>
                  {entry.evidence.map((evidence) => (
                    <div key={evidenceLabel(evidence)}>{evidenceLabel(evidence)}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ))}
  </section>
);
