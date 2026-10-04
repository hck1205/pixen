/**
 * One call for a picture that might be moving.
 *
 * A host that accepts both — a review tool, a listing site, an inbox — knows
 * which options it wants and does not want to know which of two functions to
 * call, or to state the size and the progress reporter twice. This decides from
 * the document, which is the only thing that can: a document with a duration
 * came from a moving source, and one without did not.
 *
 * It is a dispatcher rather than a layer. Everything it does not name is passed
 * through to whichever export it chose, and both of those remain callable
 * directly for a host that knows which it has.
 */
import {
  exportDocument,
  PixenError,
  type EditorDocument,
  type ExportOptions,
  type ExportResult,
  type ResourceManager,
  type Size,
  type StepReporter,
} from "@pixen/core";
import { exportClip, type VideoExportOptions, type VideoExportResult } from "./export.js";

/** What both exports understand, stated once. */
export interface SharedMediaOptions {
  /** Output pixels. Defaults to what the document exports at. */
  size?: Size;
  signal?: AbortSignal;
  /**
   * Stage names differ between the two — a still encodes, a clip records — so
   * the stage is reported as the string the export itself uses rather than
   * flattened into a vocabulary that fits neither.
   */
  onProgress?: StepReporter<string>;
}

export interface MediaExportOptions extends SharedMediaOptions {
  /** Passed through when the document turns out to be a still picture. */
  image?: Omit<ExportOptions, "width" | "height" | "signal" | "onProgress">;
  /** Passed through when it turns out to be a moving one. */
  video?: Omit<VideoExportOptions, "size" | "signal" | "onProgress">;
  /** The element a moving document was opened from. Ignored for a still one. */
  element?: HTMLVideoElement;
}

export type MediaExportResult =
  | ({ kind: "image" } & ExportResult)
  | ({ kind: "video" } & VideoExportResult);

/**
 * True when this document describes something that moves.
 *
 * The duration is the test rather than the presence of a clip range: a video
 * nobody has trimmed is still a video, and a clip range is optional.
 */
export function isMoving(document: EditorDocument): boolean {
  return document.source.duration !== undefined;
}

export async function exportMedia(
  document: EditorDocument,
  resources: ResourceManager,
  options: MediaExportOptions = {},
): Promise<MediaExportResult> {
  const { size, signal, onProgress } = options;

  if (!isMoving(document)) {
    const result = await exportDocument(document, resources, {
      ...options.image,
      // A still export names the size by its axes rather than as a box.
      ...(size ? { width: size.width, height: size.height } : {}),
      signal,
      onProgress,
    });
    return { kind: "image", ...result };
  }

  if (!options.element) {
    throw new PixenError(
      "INVALID_STATE",
      "This document has a moving source, so exporting it needs the video element it was opened from",
    );
  }

  const result = await exportClip(document, options.element, resources, {
    ...options.video,
    size,
    signal,
    onProgress,
  });
  return { kind: "video", ...result };
}
