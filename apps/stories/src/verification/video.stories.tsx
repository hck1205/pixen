/**
 * Verification · Video.
 *
 * The matrix slice, and the codec probe. The costs and the container are the
 * two things a host most needs to know before building on `@pixen/video`, and
 * both are properties of the browser rather than of Pixen — so the page asks
 * the browser rather than repeating a measurement taken somewhere else.
 */
import { useEffect, useState } from "react";
import { supportedRecordingType } from "@pixen/video";
import { COMPARISON_NOTE, ClaimTable } from "./table.js";
import { VIDEO_CLAIMS } from "./matrix/index.js";
import { codeBlock, note, panelTitle, table, tableCell, tableHeader } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Video",
} satisfies StoryDefault;

export const Matrix: Story = () => (
  <section style={{ display: "grid", gap: 16 }}>
    {/* No heading of its own: the group titles inside the table already say
        which slice this is, and two identical headings read as a mistake. */}
    <header style={{ padding: "4px 2px 0" }}>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>
    <ClaimTable groups={VIDEO_CLAIMS} />
  </section>
);

/**
 * What to ask this browser about.
 *
 * The four that matter to a host choosing a target: the two WebM codecs Pixen
 * writes today, and the two MP4 spellings a host will try first because MP4 is
 * what everything else plays.
 */
const CANDIDATES = [
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
];

interface Probe {
  supported: Array<{ type: string; ok: boolean }>;
  chosen: string | null;
  recorder: boolean;
  encoder: boolean;
}

function probe(): Probe {
  const recorder = typeof MediaRecorder !== "undefined";
  return {
    recorder,
    // WebCodecs. Present in the spec, absent in the browsers this repository has
    // measured — which is why it is a seam a host reaches for and not a dependency.
    encoder: typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !== "undefined",
    chosen: supportedRecordingType(),
    supported: CANDIDATES.map((type) => ({
      type,
      ok: recorder && MediaRecorder.isTypeSupported(type),
    })),
  };
}

export const VideoCodecs: Story = () => {
  const [result, setResult] = useState<Probe | null>(null);
  useEffect(() => setResult(probe()), []);

  if (!result) return <pre style={codeBlock}>Asking the browser…</pre>;

  return (
    <section style={{ display: "grid", gap: 12, padding: "4px 2px 40px", maxWidth: 720 }}>
      <h2 style={panelTitle}>What this browser will actually write</h2>
      <p style={note}>
        Asked live, through the same call the exporter makes. `MediaRecorder` is{" "}
        {result.recorder ? "present" : "absent"}; `VideoEncoder` — WebCodecs — is{" "}
        {result.encoder ? "present" : "absent"}. Pixen would record{" "}
        <code>{result.chosen ?? "nothing at all"}</code>.
      </p>
      <table style={table}>
        <thead>
          <tr>
            <th style={tableHeader}>Container and codec</th>
            <th style={tableHeader}>This browser</th>
          </tr>
        </thead>
        <tbody>
          {result.supported.map((row) => (
            <tr key={row.type}>
              <td style={{ ...tableCell, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{row.type}</td>
              <td style={tableCell}>{row.ok ? "supported" : "refused"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={note}>
        A refusal here is not a Pixen limit and cannot be worked around by Pixen: the browser will not write
        that container. It is the reason the recorder is a seam — a host that needs MP4 supplies an encoder,
        and a test in the browser suite proves the seam by handing back a file Pixen's own recorder could not
        have produced.
      </p>
    </section>
  );
};
