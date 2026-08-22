/**
 * Verification · Intake.
 *
 * The matrix slice, and a probe that puts the same picture in through every
 * kind of input the engine accepts — because "one call for all of them" is the
 * sort of claim that is easy to write and easy to have quietly stopped being
 * true for one of the six.
 */
import { createEditor, isPixenError, type Editor } from "@pixen/core";
import { matrixStory } from "./table.js";
import { INTAKE_CLAIMS } from "./matrix/index.js";
import { createSampleImage } from "../fixtures.js";
import { DataTable } from "../data-table.js";
import { useAsync } from "../harness.js";
import { codeBlock, note, panelTitle } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Intake",
} satisfies StoryDefault;

export const Matrix: Story = matrixStory(INTAKE_CLAIMS);

interface Attempt {
  kind: string;
  outcome: string;
  ok: boolean;
}

/** Each input kind, built from one sample so the six are otherwise identical. */
async function attempts(sample: Blob): Promise<Attempt[]> {
  const bytes = await sample.arrayBuffer();
  const bitmap = await createImageBitmap(sample);
  const objectUrl = URL.createObjectURL(sample);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);

  const inputs: Array<{ kind: string; input: unknown }> = [
    { kind: "Blob", input: sample },
    { kind: "File", input: new File([sample], "sample.jpg", { type: sample.type }) },
    { kind: "ArrayBuffer", input: bytes },
    { kind: "Uint8Array", input: new Uint8Array(bytes) },
    { kind: "ImageBitmap", input: bitmap },
    { kind: "HTMLCanvasElement", input: canvas },
    { kind: "Object URL", input: objectUrl },
    { kind: "Data URL", input: canvas.toDataURL("image/png") },
  ];

  const results: Attempt[] = [];
  for (const { kind, input } of inputs) {
    const editor: Editor = createEditor();
    try {
      const document = await editor.load(input as Parameters<Editor["load"]>[0]);
      results.push({
        kind,
        ok: true,
        outcome: `${document.source.width} × ${document.source.height}`,
      });
    } catch (error) {
      results.push({
        kind,
        ok: false,
        outcome: isPixenError(error) ? `${error.code}: ${error.message}` : String(error),
      });
    } finally {
      editor.destroy();
    }
  }
  URL.revokeObjectURL(objectUrl);
  bitmap.close();
  return results;
}

/**
 * Eight ways in, one `load`.
 *
 * The engine is driven directly rather than through the element: the claim is
 * about the API a host calls, and a story that went through the custom element
 * would be testing the element's `src` handling instead.
 */
export const Sources: Story = () => {
  const rows = useAsync(() => createSampleImage({ width: 640, height: 426 }).then(attempts), []);

  return (
    <section style={{ display: "grid", gap: 12, padding: "4px 2px 40px", maxWidth: 720 }}>
      <h2 style={panelTitle}>Every input kind, loaded live</h2>
      <p style={note}>
        The same 640 × 426 picture, handed to a fresh engine eight ways. Each row is a real `load` in this
        browser, right now — the size is read back off the document it produced.
      </p>
      {!rows && <pre style={codeBlock}>Loading…</pre>}
      {rows && (
        <DataTable
          rows={rows}
          keyOf={(row) => row.kind}
          columns={[
            { header: "Input", cell: (row) => row.kind, style: { fontWeight: 600, whiteSpace: "nowrap" } },
            { header: "Result", cell: (row) => `${row.ok ? "loaded · " : "refused · "}${row.outcome}` },
          ]}
        />
      )}
    </section>
  );
};
