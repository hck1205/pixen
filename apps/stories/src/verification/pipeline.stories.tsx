/**
 * Verification · Pipeline.
 *
 * The seams a host reaches into. The matrix says the five hooks exist and fire
 * in a fixed order; this page runs an export with all five wired and prints the
 * order they actually fired in, which is the only way that claim is worth
 * anything.
 */
import { createEditor, type ExportHooks } from "@pixen/core";
import { matrixStory } from "./table.js";
import { PIPELINE_CLAIMS } from "./matrix/index.js";
import { createSampleImage } from "../fixtures.js";
import { formatBytes, useAsync } from "../harness.js";
import { codeBlock, logList, note, panelTitle } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Pipeline",
} satisfies StoryDefault;

export const Matrix: Story = matrixStory(PIPELINE_CLAIMS);

/**
 * Every hook, wired to say what it saw.
 *
 * `resample` only runs when the export is much smaller than the source, so the
 * export below asks for a small one — otherwise the hook would be absent from
 * the log and the reader would be left wondering whether it exists.
 */
async function runWithHooks(sample: Blob): Promise<string[]> {
  const log: string[] = [];
  const editor = createEditor();
  await editor.load(sample);

  const hooks: ExportHooks = {
    document: (document) => {
      log.push(`document — ${document.layers.length} layers, format ${document.output.format ?? "match source"}`);
      return document;
    },
    resample: (source, from, to) => {
      log.push(`resample — ${from.width}×${from.height} down to ${to.width}×${to.height}`);
      return source;
    },
    pixels: (surface, size) => {
      log.push(`pixels — a ${size.width}×${size.height} surface, before encoding`);
      // Proof it is the real surface: a mark drawn here reaches the file.
      surface.context.fillStyle = "rgba(255,255,255,0.9)";
      surface.context.fillRect(8, 8, 40, 8);
    },
    bytes: (blob, context) => {
      log.push(`bytes — ${formatBytes(blob.size)} of ${context.format}`);
      return blob;
    },
    filename: (suggested, context) => {
      log.push(`filename — suggested "${suggested}" for ${context.format}`);
      return `verified-${suggested}`;
    },
  };

  const result = await editor.export({ format: "image/jpeg", width: 320, hooks });
  log.push(`delivered — ${result.filename}, ${result.width}×${result.height}, ${formatBytes(result.bytes)}`);
  editor.destroy();
  return log;
}

export const HookOrder: Story = () => {
  const log = useAsync(
    () =>
      createSampleImage({ width: 1600, height: 1067 })
        .then(runWithHooks)
        .catch((cause: unknown) => [`The export failed: ${cause instanceof Error ? cause.message : String(cause)}`]),
    [],
  );

  return (
    <section style={{ display: "grid", gap: 12, padding: "4px 2px 40px", maxWidth: 760 }}>
      <h2 style={panelTitle}>Five hooks, in the order they fired</h2>
      <p style={note}>
        One export of a 1600 × 1067 picture down to 320 wide, with all five hooks wired to report what they
        were given. The `pixels` hook draws a white bar into the surface it is handed, so the last line is
        also evidence that it was the real one.
      </p>
      {!log && <pre style={codeBlock}>Exporting…</pre>}
      {log && (
        <ol style={logList}>
          {log.map((line, index) => (
            <li key={line}>
              {index + 1}. {line}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
