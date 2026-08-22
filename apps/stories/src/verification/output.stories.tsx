/**
 * Verification · Output.
 *
 * The matrix slice, plus the two claims that are only worth anything if you
 * watch them happen: what each format costs on the same picture, and what the
 * byte budget does when it cannot reach the number it was given.
 */
import { useEffect, useState } from "react";
import { createEditor, IMAGE_FORMATS, type ImageFormat } from "@pixen/core";
import { COMPARISON_NOTE, ClaimTable } from "./table.js";
import { OUTPUT_CLAIMS } from "./matrix/index.js";
import { createSampleImage } from "../fixtures.js";
import { formatBytes } from "../harness.js";
import { codeBlock, note, panelTitle, table, tableCell, tableHeader } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Output",
} satisfies StoryDefault;

export const Matrix: Story = () => (
  <section style={{ display: "grid", gap: 16 }}>
    {/* No heading of its own: the group titles inside the table already say
        which slice this is, and two identical headings read as a mistake. */}
    <header style={{ padding: "4px 2px 0" }}>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>
    <ClaimTable groups={OUTPUT_CLAIMS} />
  </section>
);

interface FormatRow {
  format: string;
  bytes: number;
  quality: number;
}

async function encodeEach(sample: Blob): Promise<FormatRow[]> {
  const editor = createEditor();
  await editor.load(sample);
  const rows: FormatRow[] = [];
  for (const format of IMAGE_FORMATS as readonly ImageFormat[]) {
    const result = await editor.export({ format, quality: 0.82 });
    rows.push({ format, bytes: result.bytes, quality: result.quality });
  }
  editor.destroy();
  return rows;
}

/** The same picture through every encoder the browser has, priced. */
export const Formats: Story = () => {
  const [rows, setRows] = useState<FormatRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createSampleImage({ width: 1200, height: 800 })
      .then(encodeEach)
      .then((result) => {
        if (!cancelled) setRows(result);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ display: "grid", gap: 12, padding: "4px 2px 40px", maxWidth: 620 }}>
      <h2 style={panelTitle}>Every format, priced on one picture</h2>
      <p style={note}>
        One 1200 × 800 document, exported once per format at quality 0.82, in this browser. The numbers are
        this machine's — the point is the ratio between them, and that every format actually encodes.
      </p>
      {!rows && <pre style={codeBlock}>Encoding…</pre>}
      {rows && (
        <table style={table}>
          <thead>
            <tr>
              <th style={tableHeader}>Format</th>
              <th style={tableHeader}>Bytes</th>
              <th style={tableHeader}>Quality used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.format}>
                <td style={{ ...tableCell, fontWeight: 600 }}>{row.format}</td>
                <td style={tableCell}>{formatBytes(row.bytes)}</td>
                <td style={tableCell}>{row.quality.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

interface BudgetRow {
  budget: string;
  bytes: number;
  quality: number;
  attempts: number;
  met: boolean;
}

/** Three budgets: comfortable, tight, and one no quality can reach. */
const BUDGETS = [400_000, 60_000, 4_000];

async function search(sample: Blob): Promise<BudgetRow[]> {
  const editor = createEditor();
  await editor.load(sample);
  const rows: BudgetRow[] = [];
  for (const maxBytes of BUDGETS) {
    const result = await editor.export({ format: "image/jpeg", quality: 0.92, maxBytes });
    rows.push({
      budget: formatBytes(maxBytes),
      bytes: result.bytes,
      quality: result.quality,
      attempts: result.encodeAttempts,
      met: result.bytes <= maxBytes,
    });
  }
  editor.destroy();
  return rows;
}

/**
 * The budget search, including the case it cannot win.
 *
 * The last row is the interesting one: below the quality floor the search
 * stops and hands back a file that is over budget, rather than one nobody
 * would want to look at. A host that needs it smaller than that has to make
 * the picture smaller, and this page says so rather than letting them find out.
 */
export const ByteBudget: Story = () => {
  const [rows, setRows] = useState<BudgetRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createSampleImage({ width: 1600, height: 1067 })
      .then(search)
      .then((result) => {
        if (!cancelled) setRows(result);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ display: "grid", gap: 12, padding: "4px 2px 40px", maxWidth: 720 }}>
      <h2 style={panelTitle}>A byte budget, and the one it cannot meet</h2>
      <p style={note}>
        The same 1600 × 1067 picture exported three times with a different ceiling. Each row reports what
        came out, at what quality, after how many encodes.
      </p>
      {!rows && <pre style={codeBlock}>Searching…</pre>}
      {rows && (
        <table style={table}>
          <thead>
            <tr>
              <th style={tableHeader}>Budget</th>
              <th style={tableHeader}>Produced</th>
              <th style={tableHeader}>Quality</th>
              <th style={tableHeader}>Encodes</th>
              <th style={tableHeader}>Within budget</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.budget}>
                <td style={{ ...tableCell, fontWeight: 600, whiteSpace: "nowrap" }}>{row.budget}</td>
                <td style={tableCell}>{formatBytes(row.bytes)}</td>
                <td style={tableCell}>{row.quality.toFixed(2)}</td>
                <td style={tableCell}>{row.attempts}</td>
                <td style={tableCell}>{row.met ? "yes" : "no — at the quality floor"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
