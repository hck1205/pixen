/**
 * The stories that exist to be checked against a specification rather than
 * admired: the styling surface, the layer list, the output panel, multi-size
 * export, and the coverage table that ties every capability to the suite that
 * proves it.
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
} from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import { COVERAGE, coverageCount, evidenceLabel } from "./coverage.js";
import { Row, SeededEditor, Stage, formatBytes, useSampleImage } from "./harness.js";
import {
  capabilityCell,
  codeBlock,
  evidenceCell,
  hostButton,
  logList,
  note,
  panelTitle,
  table,
  tableCell,
  tableHeader,
  wideTable,
} from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Editor",
} satisfies StoryDefault;

/**
 * One shape per styling axis, so a reviewer can see what the inspector can
 * reach: fill, dash, corner radius, arrowheads, alignment and a text plate.
 */
function seedStyling(editor: Editor): void {
  const { width, height } = editor.document.source;
  const stroke = { color: "#ef3e36", width: Math.max(2, width * 0.005) };

  editor.addLayer(
    createRectLayer(
      { x: width * 0.05, y: height * 0.1, width: width * 0.24, height: height * 0.2 },
      { stroke, fill: "rgba(239, 62, 54, 0.25)", name: "Filled" },
    ),
    { select: false },
  );
  editor.addLayer(
    createRectLayer(
      { x: width * 0.33, y: height * 0.1, width: width * 0.24, height: height * 0.2 },
      { stroke: { ...stroke, color: "#f2a007" }, cornerRadius: height * 0.05, name: "Rounded" },
    ),
    { select: false },
  );
  editor.addLayer(
    createEllipseLayer(
      { x: width * 0.61, y: height * 0.1, width: width * 0.24, height: height * 0.2 },
      {
        // The dash is measured in stroke widths, so it looks the same at any size.
        stroke: { ...stroke, color: "#2fb673", dash: [stroke.width * 2.5, stroke.width * 2] },
        name: "Dashed",
      },
    ),
    { select: false },
  );
  editor.addLayer(
    createLineLayer(
      { x: width * 0.1, y: height * 0.45 },
      { x: width * 0.45, y: height * 0.45 },
      { stroke: { ...stroke, color: "#8b5cf0" }, arrowStart: true, arrowEnd: true, name: "Both heads" },
    ),
    { select: false },
  );
  editor.addLayer(
    createTextLayer({ x: width * 0.5, y: height * 0.62 }, "Centred, on a plate", {
      fontSize: Math.round(height * 0.055),
      color: "#fbfcfe",
      align: "center",
      backgroundColor: "rgba(18, 22, 28, 0.6)",
      name: "Caption",
    }),
    { select: false },
  );
}

/** Every axis the annotation style controls can reach, in one picture. */
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
        <PixenImageEditor
          ref={handle}
          src={image}
          onLoad={() => {
            const editor = handle.current?.editor;
            if (editor) seedStyling(editor);
          }}
          style={{ height: "100%" }}
        />
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

/**
 * The host round trip.
 *
 * Everything a host does between "give me the picture" and "here is a different
 * picture" — a background remover, an upscaler, a retouching service — looks
 * the same from the editor: slow, invisible, and it must not lose the edit.
 * Crop something and draw on it first, then send it: the crop, the marks and
 * the undo stack all survive.
 */
export const RoundTrip: Story = () => {
  const image = useSampleImage();
  const handle = useRef<PixenImageEditorHandle>(null);
  const [log, setLog] = useState<string[]>([]);

  async function roundTrip(): Promise<void> {
    const element = handle.current?.element;
    const editor = handle.current?.editor;
    if (!element || !editor) return;

    const before = {
      layers: editor.document.layers.length,
      depth: editor.historyState.depth,
    };

    // Stands in for the service: the same picture, in monochrome.
    element.status = "Sending to the service…";
    element.disabled = true;
    try {
      const replacement = await monochrome(editor);
      await new Promise((resolve) => setTimeout(resolve, DEMO_SERVICE_DELAY_MS));
      await element.replaceSource(replacement);
      setLog((entries) => [
        ...entries,
        `pixels replaced · ${before.layers} annotation(s) kept · history ${before.depth} → ${editor.historyState.depth}`,
      ]);
    } finally {
      element.status = null;
      element.disabled = false;
    }
  }

  return (
    <Row>
      <Stage
        title="Round trip"
        note="Crop and annotate, then send. The picture underneath changes; the edit does not. Undo puts the original pixels back."
      >
        <PixenImageEditor
          ref={handle}
          src={image}
          onLoad={() => {
            const editor = handle.current?.editor;
            if (editor) seedStyling(editor);
          }}
          style={{ height: "100%" }}
        />
      </Stage>
      <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={panelTitle}>Service</h2>
        <p style={note}>
          While it runs the editor is disabled and says so — the picture stays on screen, and nothing responds.
        </p>
        <button type="button" onClick={() => void roundTrip()} style={{ ...hostButton, justifySelf: "start" }}>
          Remove the colour
        </button>
        {log.length === 0 ? (
          <p style={note}>Nothing sent yet.</p>
        ) : (
          <ul style={logList}>
            {log.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </Row>
  );
};

/** How long the pretend service takes, so the disabled state is visible. */
const DEMO_SERVICE_DELAY_MS = 900;

/** Draws the current source in monochrome: a stand-in for a real service. */
async function monochrome(editor: Editor): Promise<Blob> {
  const { width, height } = editor.resource;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.filter = "grayscale(1) contrast(1.1)";
  context.drawImage(editor.resource.source, 0, 0, width, height);
  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

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
