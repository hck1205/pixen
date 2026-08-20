import { processImages } from "@pixen/core";
import type { ImageFormat } from "@pixen/core";
import { formatBytes } from "./bytes.js";
import { sampleImage } from "./sample.js";

/**
 * The batch section: the same resize and re-encode the editor does, with no
 * editor involved.
 *
 * It is its own module because it is its own demo — an upload form's worth of
 * behaviour that happens to sit on the same page. It reads the export settings
 * rather than owning them, so the controls at the top of the page stay the one
 * place they are chosen.
 */
export interface BatchSettings {
  format(): ImageFormat | undefined;
  quality(): number;
}

/** The longest edge a batched image is shrunk to. */
const BATCH_MAX_WIDTH = 1600;
/** Images decoded at once: decoding is the memory peak, so this stays low. */
const BATCH_CONCURRENCY = 2;
/** How many pictures the "try it" button makes up. */
const SAMPLE_COUNT = 3;

const batchOpen = document.querySelector<HTMLButtonElement>("#batch-open")!;
const batchSample = document.querySelector<HTMLButtonElement>("#batch-sample")!;
const batchFile = document.querySelector<HTMLInputElement>("#batch-file")!;
const batchProgress = document.querySelector<HTMLElement>("#batch-progress")!;
const batchResults = document.querySelector<HTMLOListElement>("#batch-results")!;


/** Object URLs handed to download links, revoked when the list is replaced. */
let batchUrls: string[] = [];

function clearBatch(): void {
  for (const url of batchUrls) URL.revokeObjectURL(url);
  batchUrls = [];
  batchResults.replaceChildren();
}

/**
 * Runs the batch pipeline over whatever was chosen.
 *
 * This is the whole point of `processImages`: the same resize and re-encode the
 * editor does, with no editor involved — which is what an upload form wants.
 */
async function runBatch(files: File[], settings: BatchSettings): Promise<void> {
  if (files.length === 0) return;
  clearBatch();
  batchOpen.disabled = true;
  batchSample.disabled = true;
  batchProgress.textContent = `0 / ${files.length}`;

  try {
    const outcomes = await processImages(files, {
      maxWidth: BATCH_MAX_WIDTH,
      format: settings.format(),
      quality: settings.quality(),
      concurrency: BATCH_CONCURRENCY,
      onProgress: ({ completed, total }) => {
        batchProgress.textContent = `${completed} / ${total}`;
      },
    });

    for (const [index, outcome] of outcomes.entries()) {
      const item = document.createElement("li");
      const name = files[index]?.name ?? `image ${index + 1}`;

      if (outcome.status === "rejected") {
        item.className = "failed";
        item.textContent = `${name} — ${outcome.error.message}`;
      } else {
        const { result } = outcome;
        const url = URL.createObjectURL(result.blob);
        batchUrls.push(url);

        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        link.textContent = result.filename;

        const detail = document.createElement("span");
        const saved = result.savedBytes === null ? "" : `, saved ${formatBytes(result.savedBytes)}`;
        detail.textContent = ` — ${result.width} × ${result.height}, ${formatBytes(result.bytes)}${saved}`;

        item.append(link, detail);
      }
      batchResults.append(item);
    }
  } catch (error) {
    batchProgress.textContent = String(error);
  } finally {
    batchOpen.disabled = false;
    batchSample.disabled = false;
  }
}

/** Wires the section up. Called once, from `main.ts`. */
export function attachBatch(settings: BatchSettings): void {
  batchOpen.addEventListener("click", () => batchFile.click());
  batchFile.addEventListener("change", () => {
    void runBatch([...(batchFile.files ?? [])], settings);
  });
  batchSample.addEventListener("click", () => {
    // Generated rather than fetched, so the demo needs no network and no assets.
    void Promise.all(Array.from({ length: SAMPLE_COUNT }, () => sampleImage())).then((blobs) =>
      runBatch(
        blobs.map((blob, index) => new File([blob], `sample-${index + 1}.jpg`, { type: blob.type })),
        settings,
      ),
    );
  });
}
