/**
 * Verification · Geometry.
 *
 * The matrix slice, and the one probe that a table cannot carry: the four
 * coordinate spaces, converted live, so "every conversion goes through one
 * module" is something a reader can watch rather than take on trust.
 */
import { useEffect, useState } from "react";
import { createEditor, imageToStage, outputSize, stageSize, type Editor } from "@pixen/core";
import { COMPARISON_NOTE, ClaimTable } from "./table.js";
import { GEOMETRY_CLAIMS } from "./matrix/index.js";
import { createSampleImage } from "../fixtures.js";
import { codeBlock, note, panelTitle, table, tableCell, tableHeader } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Geometry",
} satisfies StoryDefault;

export const Matrix: Story = () => (
  <section style={{ display: "grid", gap: 16 }}>
    {/* No heading of its own: the group titles inside the table already say
        which slice this is, and two identical headings read as a mistake. */}
    <header style={{ padding: "4px 2px 0" }}>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>
    <ClaimTable groups={GEOMETRY_CLAIMS} />
  </section>
);

interface SpaceRow {
  step: string;
  image: string;
  stage: string;
  output: string;
}

const size = (value: { width: number; height: number }): string =>
  `${Math.round(value.width)} × ${Math.round(value.height)}`;

/** One row per edit, so the reader can see which space each edit moved. */
function measure(editor: Editor, step: string): SpaceRow {
  const document = editor.document;
  return {
    step,
    image: size(document.source),
    stage: size(stageSize(document)),
    output: size(outputSize(document)),
  };
}

async function walk(sample: Blob): Promise<{ rows: SpaceRow[]; corner: string }> {
  const editor = createEditor();
  await editor.load(sample);
  const rows = [measure(editor, "Loaded")];

  editor.rotateRight();
  rows.push(measure(editor, "Rotated a quarter turn"));

  editor.setAspectRatio(1);
  rows.push(measure(editor, "Locked to 1:1"));

  editor.straighten(0.15);
  rows.push(measure(editor, "Straightened 8.6°"));

  editor.setOutput({ width: 400 });
  rows.push(measure(editor, "Output width 400"));

  // The top-left of the image, taken into stage space by the same matrix the
  // renderer and the exporter use. Nothing here computes a transform of its own.
  const matrix = imageToStage(editor.document.source, editor.document.transform);
  const corner = JSON.stringify(
    { x: Math.round(matrix.e * 100) / 100, y: Math.round(matrix.f * 100) / 100 },
    null,
    0,
  );
  editor.destroy();
  return { rows, corner };
}

/**
 * The spaces, moving.
 *
 * Image is what was decoded; stage is the picture after rotation and
 * straightening; output is what a file would be. A row where two of them change
 * together is the coordinate model doing its job.
 */
export const Spaces: Story = () => {
  const [result, setResult] = useState<{ rows: SpaceRow[]; corner: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createSampleImage({ width: 1200, height: 800 })
      .then(walk)
      .then((value) => {
        if (!cancelled) setResult(value);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ display: "grid", gap: 12, padding: "4px 2px 40px", maxWidth: 760 }}>
      <h2 style={panelTitle}>Four spaces, one conversion module</h2>
      <p style={note}>
        A 1200 × 800 picture, edited step by step in this browser. Image is what was decoded, stage is the
        picture after the rotation and the straightening, output is what a file would be.
      </p>
      {!result && <pre style={codeBlock}>Measuring…</pre>}
      {result && (
        <>
          <table style={table}>
            <thead>
              <tr>
                <th style={tableHeader}>Step</th>
                <th style={tableHeader}>Image</th>
                <th style={tableHeader}>Stage</th>
                <th style={tableHeader}>Output</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.step}>
                  <td style={{ ...tableCell, fontWeight: 600, whiteSpace: "nowrap" }}>{row.step}</td>
                  <td style={tableCell}>{row.image}</td>
                  <td style={tableCell}>{row.stage}</td>
                  <td style={tableCell}>{row.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={note}>
            The image origin lands at {result.corner} in stage space after all of that — read from
            `imageToStage`, the same matrix the renderer and the exporter use.
          </p>
        </>
      )}
    </section>
  );
};
