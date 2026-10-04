import "@pixen/web";
import { registerBundledLocales } from "@pixen/web";
import { ImageWorker, createRectLayer, layerHandlePosition } from "@pixen/core";
import type { ExportResult, ImageFormat, PresetName } from "@pixen/core";
import type { PixenImageEditorElement } from "@pixen/web";
import { attachBatch } from "./batch.js";
import { formatBytes } from "./bytes.js";
import { configSnippet } from "./config.js";
import { sampleImage } from "./sample.js";

// Every language, because a demo is where you go to see them. A product would
// import only the ones it ships — see `docs/FRAMEWORKS.md`.
registerBundledLocales();

/**
 * A small window hook for the browser suite.
 *
 * The tests drive the built playground, and geometry they assert against has to
 * come from the engine itself — re-deriving a handle position in the test would
 * only prove the test agrees with itself.
 */
(window as unknown as { pixen: Record<string, unknown> }).pixen = {
  layerHandlePosition,
  ImageWorker,
  createRectLayer,
};

const editor = document.querySelector<PixenImageEditorElement>("#editor")!;
const preset = document.querySelector<HTMLSelectElement>("#preset")!;
const format = document.querySelector<HTMLSelectElement>("#format")!;
const quality = document.querySelector<HTMLInputElement>("#quality")!;
const qualityValue = document.querySelector<HTMLOutputElement>("#quality-value")!;
const locale = document.querySelector<HTMLSelectElement>("#locale")!;
const theme = document.querySelector<HTMLSelectElement>("#theme")!;
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const download = document.querySelector<HTMLAnchorElement>("#download")!;
const configCode = document.querySelector<HTMLElement>("#config code")!;
const statSize = document.querySelector<HTMLElement>("#stat-size")!;
const statBytes = document.querySelector<HTMLElement>("#stat-bytes")!;
const statSaved = document.querySelector<HTMLElement>("#stat-saved")!;
const openButton = document.querySelector<HTMLButtonElement>("#open")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;

let lastUrl: string | null = null;

function renderConfig(): void {
  configCode.textContent = configSnippet({
    theme: theme.value,
    locale: locale.value,
    format: format.value,
    quality: quality.value,
    preset: preset.value,
  });
}

function showResult(result: ExportResult): void {
  statSize.textContent = `${result.width} × ${result.height}`;
  statBytes.textContent = formatBytes(result.bytes);
  statSaved.textContent =
    result.sourceBytes == null
      ? "—"
      : `${formatBytes(result.sourceBytes - result.bytes)} (${Math.round(
          (1 - result.bytes / result.sourceBytes) * 100,
        )}%)`;

  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(result.blob);
  download.href = lastUrl;
  download.download = result.filename;
  download.hidden = false;
}

preset.addEventListener("change", () => {
  editor.policy = (preset.value || null) as PresetName | null;
  renderConfig();
});

format.addEventListener("change", () => {
  if (format.value) editor.setAttribute("format", format.value as ImageFormat);
  else editor.removeAttribute("format");
  renderConfig();
});

quality.addEventListener("input", () => {
  qualityValue.value = quality.value;
  editor.setAttribute("quality", quality.value);
  renderConfig();
});

locale.addEventListener("change", () => {
  editor.setAttribute("locale", locale.value);
  renderConfig();
});

theme.addEventListener("change", () => {
  editor.setAttribute("theme", theme.value);
  renderConfig();
});

openButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void editor.load(file);
});

exportButton.addEventListener("click", () => {
  void editor.export().catch((error) => console.error(error));
});

editor.addEventListener("pixen-export", (event) => showResult((event as CustomEvent<ExportResult>).detail));
editor.addEventListener("pixen-error", (event) => {
  const { error } = (event as CustomEvent<{ error: Error & { code?: string } }>).detail;
  console.error(`[pixen:${error.code ?? "unknown"}]`, error.message);
});

attachBatch({
  format: () => (format.value ? (format.value as ImageFormat) : undefined),
  quality: () => Number(quality.value),
});

renderConfig();
void sampleImage().then((blob) => editor.load(blob));
