/**
 * How a file leaves the editor.
 *
 * One picture is rarely one file, and an export is rarely just an encode: a
 * responsive page wants a handful of widths, and an application eventually
 * wants to bend what comes out — a mask, a tone, a name its storage dictates.
 * Both are about the way out rather than the edit itself.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createSurface, drawResized, maskBlob, srcset, type ExportHooks, type ExportVariant } from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import { seedAnnotations, seedStyling } from "./fixtures.js";
import { Row, SeededEditor, Stage, formatBytes, usePreviewBlob, useSampleImage } from "./harness.js";
import { codeBlock, hostButton, logList, note, panelTitle, table, tableCell, tableHeader } from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Editor",
} satisfies StoryDefault;

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

/**
 * The five points an export can be bent, and where the file goes.
 *
 * An export is: take a document, shrink it, draw it, encode it, name it — and
 * then hand it somewhere. Every one of those is something an application
 * eventually needs to change, and every one of them is otherwise a fork of the
 * library. Turn the switches on and export: the picture that comes back has been
 * bent at each point in turn, and the upload below reports itself as it goes.
 *
 * `resample` is the one that is only sometimes called, which is the point of
 * showing it here: it runs when the export is a large reduction and stays out of
 * the way when it is not. Switch it on and the export drops to a thumbnail, so
 * there is something for it to do.
 */
export const Pipeline: Story = () => {
  const image = useSampleImage();
  const handle = useRef<PixenImageEditorHandle>(null);
  const [mask, setMask] = useState(true);
  const [stamp, setStamp] = useState(true);
  const [shrink, setShrink] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreviewBlob] = usePreviewBlob();

  const hooks: ExportHooks = {
    document: (source) =>
      stamp ? { ...source, adjustments: { ...source.adjustments, sepia: 1 } } : source,
    resample: (source, from, to) => {
      // Pixen leaves this to the browser, having measured that halving first
      // buys nothing on Chromium. A host that has measured otherwise puts its
      // own downscaler here — this one is Pixen's, exported for exactly that.
      setLog((entries) => [...entries, `resample ${from.width}×${from.height} → ${to.width}×${to.height}`]);
      const surface = createSurface(to.width, to.height);
      drawResized(surface.context, source, from, to);
      return surface.canvas;
    },
    pixels: (surface, size) => {
      if (!mask) return;
      // A canvas, not a copy of the pixels: a circular mask is three drawing
      // calls, where an array of bytes would be two full-size allocations.
      const context = surface.context as CanvasRenderingContext2D;
      context.globalCompositeOperation = "destination-in";
      context.beginPath();
      context.arc(size.width / 2, size.height / 2, Math.min(size.width, size.height) / 2, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";
    },
    filename: (suggested) => (mask ? `round-${suggested}` : suggested),
  };

  async function run(): Promise<void> {
    const editor = handle.current?.editor;
    if (!editor) return;
    setLog([]);
    const result = await editor.export({
      format: "image/png",
      // Only a real reduction reaches the resample hook, so give it one.
      ...(shrink ? { width: THUMBNAIL_WIDTH } : {}),
      hooks,
    });
    setPreviewBlob(result.blob);
    setLog((entries) => [...entries, `${result.filename} · ${formatBytes(result.bytes)}`]);
  }

  return (
    <Row>
      <Stage
        title="Pipeline"
        note="The document, the downscale, the pixels and the filename each pass through a host step on the way out."
      >
        <PixenImageEditor
          ref={handle}
          src={image}
          onExportProgress={(report) =>
            setLog((entries) => [
              ...entries.slice(-PIPELINE_LOG_LIMIT),
              `${report.stage}${report.ratio === null ? "" : ` ${Math.round(report.ratio * 100)}%`}`,
            ])
          }
          style={{ height: "100%" }}
        />
      </Stage>
      <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={panelTitle}>Hooks</h2>
        <label style={note}>
          <input type="checkbox" checked={stamp} onChange={(event) => setStamp(event.target.checked)} /> document ·
          tone the exported copy only
        </label>
        <label style={note}>
          <input type="checkbox" checked={mask} onChange={(event) => setMask(event.target.checked)} /> pixels · cut a
          circular mask, and rename
        </label>
        <label style={note}>
          <input type="checkbox" checked={shrink} onChange={(event) => setShrink(event.target.checked)} /> resample ·
          export a thumbnail through our own downscaler
        </label>
        <button type="button" onClick={() => void run()} style={{ ...hostButton, justifySelf: "start" }}>
          Export through the hooks
        </button>
        {preview ? (
          <img src={preview} alt="The exported file" style={{ maxWidth: 220, justifySelf: "start" }} />
        ) : (
          <p style={note}>Nothing exported yet.</p>
        )}
        {log.length > 0 && (
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

/** A log that scrolls forever is a log nobody reads. */
const PIPELINE_LOG_LIMIT = 8;
/** Small enough that the resample hook has something to do. */
const THUMBNAIL_WIDTH = 240;

/**
 * The marked areas, as a picture of their own.
 *
 * A model outside the browser — inpainting, background removal, a selective
 * adjustment — needs to be told which part of the image to work on, and the
 * shapes for that already exist because someone drew them. Draw a rectangle or
 * two over the picture and the mask follows, with the photograph taken out.
 */
export const Mask: Story = () => {
  const image = useSampleImage();
  const handle = useRef<PixenImageEditorHandle>(null);
  const [preview, setPreviewBlob] = usePreviewBlob();
  const [padding, setPadding] = useState(0.01);

  async function build(): Promise<void> {
    const editor = handle.current?.editor;
    if (!editor) return;
    const blob = await maskBlob(editor.document, editor.resources, { padding });
    setPreviewBlob(blob);
  }

  return (
    <Row>
      <Stage title="Mask" note="Draw a shape or two, then build the mask. An outline marks what it encloses.">
        <SeededEditor image={image} seed={seedAnnotations} handle={handle} tool="rect" />
      </Stage>
      <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={panelTitle}>Mask</h2>
        <label style={note}>
          Padding {(padding * 100).toFixed(1)}% of the longest edge
          <input
            type="range"
            min={0}
            max={0.05}
            step={0.005}
            value={padding}
            onChange={(event) => setPadding(Number(event.target.value))}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <button type="button" onClick={() => void build()} style={{ ...hostButton, justifySelf: "start" }}>
          Build the mask
        </button>
        {preview ? (
          <img src={preview} alt="The mask" style={{ maxWidth: 260, justifySelf: "start" }} />
        ) : (
          <p style={note}>Nothing built yet.</p>
        )}
      </section>
    </Row>
  );
};
