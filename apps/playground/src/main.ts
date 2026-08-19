import "@pixen/web";
import { layerHandlePosition } from "@pixen/core";
import type { ExportResult, ImageFormat } from "@pixen/core";
import type { PixenImageEditorElement } from "@pixen/web";

/**
 * A small window hook for the browser suite.
 *
 * The tests drive the built playground, and geometry they assert against has to
 * come from the engine itself — re-deriving a handle position in the test would
 * only prove the test agrees with itself.
 */
(window as unknown as { pixen: Record<string, unknown> }).pixen = { layerHandlePosition };

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

let lastUrl: string | null = null;

/** A generated sample so the playground works with no network and no upload. */
async function sampleImage(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1067;
  const context = canvas.getContext("2d")!;

  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#1b2a5e");
  sky.addColorStop(0.55, "#e0674f");
  sky.addColorStop(1, "#f6c177");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255, 244, 214, 0.95)";
  context.beginPath();
  context.arc(1180, 430, 74, 0, Math.PI * 2);
  context.fill();

  const ridges: Array<[number, string]> = [
    [720, "#2b2f4a"],
    [820, "#1e2137"],
    [930, "#141626"],
  ];
  for (const [baseline, colour] of ridges) {
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(0, canvas.height);
    context.lineTo(0, baseline);
    for (let x = 0; x <= canvas.width; x += 40) {
      const y = baseline - Math.sin(x / 190) * 70 - Math.cos(x / 70) * 22;
      context.lineTo(x, y);
    }
    context.lineTo(canvas.width, canvas.height);
    context.closePath();
    context.fill();
  }

  // Printed detail, so the redaction tools have something real to destroy — and
  // so the browser tests can measure whether they did.
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.font = `${Math.round(canvas.height * 0.05)}px system-ui, sans-serif`;
  context.fillText("ID 4821-77", canvas.width * 0.08, canvas.height * 0.2);
  context.fillText("pixen sample", canvas.width * 0.08, canvas.height * 0.28);

  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderConfig(): void {
  const lines = [`<pixen-image-editor`, `  src="/photo.jpg"`, `  theme="${theme.value}"`];
  if (locale.value !== "en") lines.push(`  locale="${locale.value}"`);
  if (format.value) lines.push(`  format="${format.value}"`);
  lines.push(`  quality="${quality.value}"`);
  if (preset.value) lines.push(`  preset="${preset.value}"`);
  lines.push(`></pixen-image-editor>`, "", "// or headless, no UI at all:", "const result = await processImage(file, {");
  if (preset.value === "profile") lines.push("  width: 1024,", "  height: 1024,");
  else lines.push("  maxWidth: 1600,");
  lines.push(`  format: "${format.value || "image/webp"}",`, `  quality: ${quality.value},`, "});");
  configCode.textContent = lines.join("\n");
}

function showResult(result: ExportResult): void {
  document.querySelector("#stat-size")!.textContent = `${result.width} × ${result.height}`;
  document.querySelector("#stat-bytes")!.textContent = formatBytes(result.bytes);
  document.querySelector("#stat-saved")!.textContent =
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
  editor.policy = (preset.value || null) as never;
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

document.querySelector("#open")!.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void editor.load(file);
});

document.querySelector("#export")!.addEventListener("click", () => {
  void editor.export().catch((error) => console.error(error));
});

editor.addEventListener("pixen-export", (event) => showResult((event as CustomEvent<ExportResult>).detail));
editor.addEventListener("pixen-error", (event) => {
  const { error } = (event as CustomEvent<{ error: Error & { code?: string } }>).detail;
  console.error(`[pixen:${error.code ?? "unknown"}]`, error.message);
});

renderConfig();
void sampleImage().then((blob) => editor.load(blob));
