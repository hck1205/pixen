/**
 * The stories that exist to be checked against a specification rather than
 * admired: the styling surface, the layer list, the output panel and multi-size
 * export. What happens around an edit — a host round trip, progress — is in
 * `lifecycle.stories.tsx`.
 *
 * The coverage table that ties each of these to the suite proving it is next
 * door, in `coverage.stories.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEllipseLayer,
  createLineLayer,
  createRectLayer,
  createTextLayer,
  srcset,
  type Editor,
  type ExportVariant,
  type ProgressReport,
} from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import { seedStyling } from "./fixtures.js";
import { Row, SeededEditor, Stage, formatBytes, useSampleImage } from "./harness.js";
import { codeBlock, hostButton, logList, note, panelTitle, table, tableCell, tableHeader } from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Editor",
} satisfies StoryDefault;

export const Styling: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="Styling"
      note="Fill, dashes, corner radius, both arrowheads, alignment and a text plate. Pick a tool, or select a shape, and the inspector offers exactly what that kind of layer has."
    >
      <SeededEditor image={image} seed={seedStyling} tool="select" />
    </Stage>
  );
};

/** The layer list: order, visibility and locking, over the same seeded stack. */
export const Layers: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="Layers"
      note="Topmost first, which is the opposite of the order they are painted in. A hidden layer leaves the canvas; a locked one stays but stops responding to the pointer, and loses its handles."
    >
      <SeededEditor image={image} seed={seedStyling} panel="layers" />
    </Stage>
  );
};

/** Size, format, quality and background — all document state, so all undoable. */
export const Output: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="Output"
      note="Linking the ratio stores one side and lets the document scale the other, so a linked field cannot drift. Quality appears only for the formats whose encoder has one."
    >
      <SeededEditor image={image} seed={seedStyling} panel="output" />
    </Stage>
  );
};

const VARIANT_SPECS = [{ width: 1200 }, { width: 800 }, { width: 400 }, { width: 200, label: "thumb" }];

/**
 * One edit, several files.
 *
 * The sizes are planned before anything is rendered, so the list below is what
 * the export will produce rather than a report of what it happened to produce.
 */
export const Variants: Story = () => {
  const image = useSampleImage();
  const handle = useRef<PixenImageEditorHandle>(null);
  const [variants, setVariants] = useState<ExportVariant[]>([]);
  const [busy, setBusy] = useState(false);

  const urls = useMemo(() => variants.map((variant) => URL.createObjectURL(variant.blob)), [variants]);
  useEffect(
    () => () => {
      for (const url of urls) URL.revokeObjectURL(url);
    },
    [urls],
  );

  async function run(): Promise<void> {
    const editor = handle.current?.editor;
    if (!editor) return;
    setBusy(true);
    try {
      setVariants(await editor.exportVariants(VARIANT_SPECS, { format: "image/webp" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row>
      <Stage title="Variants" note="Crop or annotate first — every variant is the same edit at another size.">
        <SeededEditor image={image} seed={seedStyling} handle={handle} />
      </Stage>
      <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={panelTitle}>Files</h2>
        <button type="button" onClick={() => void run()} disabled={busy} style={{ ...hostButton, justifySelf: "start" }}>
          {busy ? "Exporting…" : "Export every size"}
        </button>
        {variants.length === 0 ? (
          <p style={note}>Nothing exported yet.</p>
        ) : (
          <>
            <table style={table}>
              <thead>
                <tr>
                  <th style={tableHeader}>File</th>
                  <th style={tableHeader}>Size</th>
                  <th style={tableHeader}>Bytes</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <tr key={variant.label}>
                    <td style={tableCell}>{variant.filename}</td>
                    <td style={tableCell}>
                      {variant.width} × {variant.height}
                    </td>
                    <td style={tableCell}>{formatBytes(variant.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <pre style={codeBlock}>
              {`<img\n  src="${urls[0] ?? ""}"\n  srcset="${srcset(
                variants.map((variant, index) => ({ url: urls[index] ?? "", width: variant.width })),
              )}"\n/>`}
            </pre>
          </>
        )}
      </section>
    </Row>
  );
};
