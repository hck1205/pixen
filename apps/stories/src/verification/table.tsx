/**
 * How a claim reads on the page.
 *
 * The table has four columns for a reason: what the capability is, what Pixen
 * does, what was asked for, and what proves the Pixen half. A comparison that
 * dropped the last column would be a feature list, and a feature list is the
 * thing this section exists not to be.
 */
import {
  evidenceLabel,
  MARKET_REFERENCE,
  VERDICT_LABELS,
  VERDICT_ORDER,
  countVerdicts,
  type Claim,
  type ClaimGroup,
  type Verdict,
} from "./claim.js";
import { capabilityCell, evidenceCell, fixedTable, note, panelTitle, tableCell, tableHeader } from "../styles.js";
import type { CSSProperties } from "react";

/**
 * A verdict's colour, as channels over the page's own tint.
 *
 * Open is the only one that reads as a warning, on purpose: a gap is the most
 * useful row on the page and the easiest one to skim past.
 */
const VERDICT_TINT: Readonly<Record<Verdict, string>> = {
  met: "60 160 120",
  open: "210 140 60",
  beyond: "90 140 230",
  unmeasured: "127 140 170",
};

const pill = (verdict: Verdict): CSSProperties => ({
  display: "inline-block",
  // Wraps rather than overflowing: the column is a fraction of the table, and a
  // pill that will not break sits on top of the evidence beside it.
  whiteSpace: "normal",
  padding: "2px 8px",
  borderRadius: 999,
  background: `rgb(${VERDICT_TINT[verdict]} / 0.18)`,
  border: `1px solid rgb(${VERDICT_TINT[verdict]} / 0.4)`,
  font: "600 11px/1.6 system-ui, sans-serif",
});

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return <span style={pill(verdict)}>{VERDICT_LABELS[verdict]}</span>;
}

function MarketCell({ claim }: { claim: Claim }) {
  if (!claim.market) {
    return <span style={{ opacity: 0.45 }}>—</span>;
  }
  return (
    <>
      <div>{claim.market.detail}</div>
      <div style={{ opacity: 0.55, fontSize: 11, marginTop: 4 }}>
        from the supplied material · {claim.market.source.topic}
      </div>
    </>
  );
}

export function ClaimTable({ groups }: { groups: readonly ClaimGroup[] }) {
  return (
    <section style={{ display: "grid", gap: 28, padding: "4px 2px 40px" }}>
      {groups.map((group) => (
        <section key={group.title} style={{ display: "grid", gap: 8 }}>
          <h3 style={panelTitle}>{group.title}</h3>
          <p style={note}>{group.summary}</p>
          <table style={fixedTable}>
            {/* Fixed proportions: left to itself the browser gives the widest
                column to whichever cell happens to hold the longest word, and
                the requirement column came out one word per line. */}
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "19%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={tableHeader}>Capability</th>
                <th style={tableHeader}>Pixen</th>
                <th style={tableHeader}>Asked for</th>
                <th style={tableHeader}>Verdict</th>
                <th style={tableHeader}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {group.claims.map((claim) => (
                <tr key={claim.capability}>
                  <td style={{ ...capabilityCell, whiteSpace: "normal" }}>{claim.capability}</td>
                  <td style={tableCell}>
                    <div>{claim.pixen}</div>
                    {claim.note && (
                      <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>{claim.note}</div>
                    )}
                  </td>
                  <td style={{ ...tableCell, opacity: 0.85 }}>
                    <MarketCell claim={claim} />
                  </td>
                  <td style={tableCell}>
                    <VerdictPill verdict={claim.verdict} />
                  </td>
                  <td style={evidenceCell}>
                    {claim.evidence.map((evidence) => (
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
}

/** The counts, so a reader can see the shape of the page before reading it. */
export function Scorecard({ groups }: { groups: readonly ClaimGroup[] }) {
  const counts = countVerdicts(groups);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {VERDICT_ORDER.map((verdict) => (
        <div
          key={verdict}
          style={{
            display: "grid",
            gap: 4,
            padding: "10px 14px",
            borderRadius: 12,
            border: `1px solid rgb(${VERDICT_TINT[verdict]} / 0.35)`,
            background: `rgb(${VERDICT_TINT[verdict]} / 0.1)`,
            minWidth: 150,
          }}
        >
          <strong style={{ font: "600 22px/1.1 system-ui, sans-serif" }}>{counts[verdict]}</strong>
          <span style={{ font: "400 12px/1.4 system-ui, sans-serif", opacity: 0.75 }}>
            {VERDICT_LABELS[verdict]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One sentence about who the comparison is, used above every table. */
export const COMPARISON_NOTE =
  `Pixen's column is verified by the suite named beside it. The middle column is a requirement taken from ` +
  `the documentation supplied for this project about ${MARKET_REFERENCE}, in our words — never a quotation, ` +
  `and never a guess about anything the material did not cover.`;
