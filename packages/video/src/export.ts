/**
 * Writing the trimmed clip out.
 *
 * Every frame goes through `createScene` and `renderScene` — the same two calls
 * the still-image export makes — so the crop, the straightening, the
 * adjustments and every annotation land on the moving picture without any of
 * them being told it moves. What this module adds is only the part that is
 * genuinely about time: seek to the start, run to the end, and paint each frame
 * as it arrives.
 */
import {
  assertDrawableSize,
  clipDuration,
  createScene,
  outputSize,
  PixenError,
  renderScene,
  throwIfAborted,
  wholeClip,
  type EditorDocument,
  type ResourceManager,
  type Size,
  type StepReporter,
} from "@pixen/core";
import { canvasRecorder, type ClipRecorder, type RecorderOptions } from "./encode.js";
import { runClip, seekTo } from "./playback.js";

/** What a cancelled video export calls itself, in one place. */
const VIDEO_EXPORT = "Video export";

export type VideoExportStage = "render" | "encode";

export interface VideoExportOptions extends RecorderOptions {
  /** Output pixels. Defaults to what the document exports a still at. */
  size?: Size;
  signal?: AbortSignal;
  /** Reports the clip's own seconds against its length. See `VideoExportStage`. */
  onProgress?: StepReporter<VideoExportStage>;
  /**
   * Somewhere other than a `MediaRecorder` for the frames to go — WebCodecs, a
   * WASM encoder, an upload that streams. See `ClipRecorder`.
   */
  recorder?: (canvas: HTMLCanvasElement, size: Size) => ClipRecorder;
}

export interface VideoExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** Seconds of clip written, which is the trimmed length rather than the source's. */
  duration: number;
  bytes: number;
  /** The container actually written. WebM unless a host's own recorder said otherwise. */
  type: string;
}

/**
 * Renders and records the document's clip.
 *
 * It runs at wall-clock speed with the recorder Pixen ships — a thirty-second
 * clip takes thirty seconds — because `MediaRecorder` samples a canvas as it is
 * painted and cannot be asked to hurry. That is the cost of needing no
 * dependency, and it is the reason `recorder` exists.
 */
export async function exportClip(
  document: EditorDocument,
  element: HTMLVideoElement,
  resources: ResourceManager,
  options: VideoExportOptions = {},
): Promise<VideoExportResult> {
  throwIfAborted(options.signal, VIDEO_EXPORT);

  const duration = document.source.duration;
  if (duration === undefined) {
    throw new PixenError("INVALID_STATE", "This document has no moving source to export");
  }

  const clip = document.clip ?? wholeClip(duration);
  const length = clipDuration(clip);
  const target = options.size ?? outputSize(document);
  assertDrawableSize(target, "video export");

  // A DOM canvas rather than an OffscreenCanvas: `captureStream` is what the
  // recorder needs and only the DOM one has it.
  const canvas = window.document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PixenError("EXPORT_FAILED", "Could not acquire a 2D context for the video export");

  const recorder = options.recorder ? options.recorder(canvas, target) : canvasRecorder(canvas, options);
  const wasPaused = element.paused;
  const startedAt = element.currentTime;

  try {
    await seekTo(element, clip.start, options.signal, VIDEO_EXPORT);

    // The first frame is painted before recording starts, so the stream has
    // something to sample the instant it does rather than a blank canvas.
    paint(context, document, element, target, resources);
    options.onProgress?.({ stage: "render", loaded: 0, total: length });
    await recorder.start();

    await runClip(element, clip, options.signal, VIDEO_EXPORT, async (seconds) => {
      paint(context, document, element, target, resources);
      await recorder.frame(seconds);
      options.onProgress?.({ stage: "render", loaded: seconds, total: length });
    });

    options.onProgress?.({ stage: "encode", loaded: 0, total: null });
    const blob = await recorder.finish();
    options.onProgress?.({ stage: "encode", loaded: 1, total: 1 });
    throwIfAborted(options.signal, VIDEO_EXPORT);

    return {
      blob,
      width: target.width,
      height: target.height,
      duration: length,
      bytes: blob.size,
      type: blob.type,
    };
  } catch (cause) {
    recorder.cancel();
    throw cause;
  } finally {
    element.pause();
    element.currentTime = startedAt;
    if (!wasPaused) void element.play().catch(() => undefined);
  }
}

/** One frame, through the scene the still export already uses. */
function paint(
  context: CanvasRenderingContext2D,
  document: EditorDocument,
  element: HTMLVideoElement,
  target: Size,
  resources: ResourceManager,
): void {
  const scene = createScene(
    document,
    { source: element, sourceScale: 1, resolveResource: resources.resolve },
    { region: "crop", target },
  );
  renderScene(context, scene);
}
