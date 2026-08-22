/**
 * Verification · Assurance.
 *
 * The claims that are not features. A buyer's diligence asks what the SDK drags
 * into the bundle, what happens when it breaks, and whether the provenance can
 * be shown — and those questions decide a purchase after both feature lists
 * have been ticked off.
 */
import { COMPARISON_NOTE, ClaimTable } from "./table.js";
import { ASSURANCE_CLAIMS, VERIFICATION } from "./matrix/index.js";
import { coverageCount } from "../coverage/index.js";
import { claimsOf } from "./claim.js";
import { note, panelTitle, table, tableCell, tableHeader } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Assurance",
} satisfies StoryDefault;

export const Matrix: Story = () => (
  <section style={{ display: "grid", gap: 16 }}>
    {/* No heading of its own: the group titles inside the table already say
        which slice this is, and two identical headings read as a mistake. */}
    <header style={{ padding: "4px 2px 0" }}>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>
    <ClaimTable groups={ASSURANCE_CLAIMS} />
  </section>
);

/**
 * What each check refuses to let through.
 *
 * The counts either side are read from the pages themselves, so this cannot
 * claim more coverage than there is.
 */
const CHECKS: ReadonlyArray<{ command: string; refuses: string }> = [
  {
    command: "pnpm check:independence",
    refuses:
      "A third-party product name in any tracked file, a runtime dependency in a published package, a " +
      "vendored or minified file, or a foreign licence header in our own source",
  },
  {
    command: "pnpm check:exports",
    refuses: "An export nothing imports, outside a short allowlist of genuine host-facing seams",
  },
  {
    command: "pnpm check:duplication",
    refuses: "A block of code repeated a third time",
  },
  {
    command: "pnpm check:size",
    refuses:
      "A source file past 300 lines with no written reason — and a written reason pinned above the size " +
      "it was granted at",
  },
  {
    command: "pnpm test",
    refuses: "Any of the above, plus every unit test — the scans run inside the suite as well as on the command line",
  },
  {
    command: "pnpm test:browser",
    refuses: "A regression in the built bundle: gestures, canvas output, encoders, and the video package",
  },
  {
    command: "pnpm test:visual",
    refuses: "A pixel change in any story that has a golden image",
  },
];

export const Checks: Story = () => (
  <section style={{ display: "grid", gap: 16, padding: "4px 2px 40px", maxWidth: 900 }}>
    <header style={{ display: "grid", gap: 6 }}>
      <h2 style={panelTitle}>What runs, and what it refuses</h2>
      <p style={note}>
        {claimsOf(VERIFICATION).length} claims on this page and {coverageCount()} capabilities on the
        coverage page are worth what the checks below are worth: every one of them fails the build rather
        than printing a warning, and each names what it will not let past.
      </p>
    </header>
    <table style={table}>
      <thead>
        <tr>
          <th style={tableHeader}>Command</th>
          <th style={tableHeader}>Refuses</th>
        </tr>
      </thead>
      <tbody>
        {CHECKS.map((check) => (
          <tr key={check.command}>
            <td style={{ ...tableCell, whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
              {check.command}
            </td>
            <td style={tableCell}>{check.refuses}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
