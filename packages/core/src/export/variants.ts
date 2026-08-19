import type { Size } from "../geometry/types.js";
import { resolveSize, type ResizeIntent } from "../image/resize.js";
import type { EditorDocument, ImageFormat } from "../model/types.js";
import { outputSize as documentOutputSize } from "../model/document.js";
import type { ResourceManager } from "../resources/manager.js";
import { exportDocument, type ExportOptions, type ExportResult } from "./pipeline.js";

/**
 * Exporting the same edit at several sizes.
 *
 * One picture is rarely one file: a responsive page wants a handful of widths
 * and a `srcset` to choose between them, and a product wants a thumbnail
 * alongside the full size. Doing that by exporting repeatedly from the host
 * works, but the host then has to re-derive every size itself and keep the
 * names in step, so the sizes are planned here — purely, before anything is
 * rendered — and the encoding follows the plan.
 */
export interface VariantSpec extends ResizeIntent {
  format?: ImageFormat;
  quality?: number;
  /** Names the file and the `srcset` entry. Defaults to the resolved width. */
  label?: string;
}

/** What a variant will be, decided before any pixels are touched. */
export interface VariantPlan {
  label: string;
  size: Size;
  format: ImageFormat | undefined;
  quality: number | undefined;
}

export interface ExportVariant extends ExportResult {
  label: string;
}

/**
 * Resolves the specs against the size the document exports at.
 *
 * Two specs that land on the same pixels in the same format are the same file,
 * so the second is dropped: asking for 800px and for "half of 1600" is one
 * variant, not two, and encoding it twice would cost a full render to produce
 * a duplicate.
 */
export function planVariants(natural: Size, specs: readonly VariantSpec[]): VariantPlan[] {
  const seen = new Set<string>();
  const plans: VariantPlan[] = [];

  for (const spec of specs) {
    const size = resolveSize(natural, spec);
    const key = `${size.width}x${size.height}:${spec.format ?? "auto"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push({
      label: spec.label ?? `${size.width}w`,
      size,
      format: spec.format,
      quality: spec.quality,
    });
  }
  return plans;
}

/**
 * Renders and encodes each planned variant, largest first.
 *
 * Sequential on purpose: each variant is a full-resolution render, and running
 * them together is how a phone runs out of memory on the picture it just took.
 */
export async function exportVariants(
  document: EditorDocument,
  resources: ResourceManager,
  specs: readonly VariantSpec[],
  options: ExportOptions = {},
): Promise<ExportVariant[]> {
  const plans = planVariants(documentOutputSize(document), specs);
  const variants: ExportVariant[] = [];

  for (const plan of plans) {
    const result = await exportDocument(document, resources, {
      ...options,
      width: plan.size.width,
      height: plan.size.height,
      ...(plan.format ? { format: plan.format } : {}),
      ...(plan.quality != null ? { quality: plan.quality } : {}),
    });
    variants.push({ ...result, label: plan.label, filename: labelledFilename(result.filename, plan.label) });
  }
  return variants;
}

/** `photo-edited.jpg` and `800w` become `photo-edited-800w.jpg`. */
export function labelledFilename(filename: string, label: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename}-${label}`;
  return `${filename.slice(0, dot)}-${label}${filename.slice(dot)}`;
}

/**
 * The value for an `<img srcset>`.
 *
 * Width descriptors rather than pixel-density ones, because the sizes come from
 * a resize plan: the browser is being told how wide each file is and left to
 * pick, which is what a responsive layout needs.
 */
export function srcset(entries: ReadonlyArray<{ url: string; width: number }>): string {
  return entries.map((entry) => `${entry.url} ${entry.width}w`).join(", ");
}
