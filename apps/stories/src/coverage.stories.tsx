/**
 * The coverage table: what Pixen does, read out of Pixen.
 *
 * Its own file because it is its own thing — every other story here drives the
 * editor, and this one reads the codebase. The title matches the rest, so the
 * story keeps its id.
 */
import { COVERAGE, coverageCount, evidenceLabel } from "./coverage/index.js";
import { DataTable, type Column } from "./data-table.js";
import { capabilityCell, evidenceCell, note, panelTitle } from "./styles.js";
import type { CoverageEntry } from "./coverage/index.js";
import type { Story, StoryDefault } from "@ladle/react";

const COVERAGE_COLUMNS: ReadonlyArray<Column<CoverageEntry>> = [
  { header: "Capability", cell: (entry) => entry.capability, style: capabilityCell },
  { header: "Layer", cell: (entry) => entry.layer, style: { opacity: 0.7 } },
  { header: "What it is", cell: (entry) => entry.detail },
  {
    header: "Evidence",
    cell: (entry) =>
      entry.evidence.map((evidence) => <div key={evidenceLabel(evidence)}>{evidenceLabel(evidence)}</div>),
    style: evidenceCell,
  },
];

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
        <DataTable
          rows={group.entries}
          keyOf={(entry) => entry.capability}
          columns={COVERAGE_COLUMNS}
        />
      </section>
    ))}
  </section>
);
