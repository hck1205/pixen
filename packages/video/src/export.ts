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
  selectionDuration,
  throwIfAborted,
  wholeClip,
  type EditorDocument,
  type ResourceManager,
  type Size,
  type StepReporter,
} from "@pixen/core";
import { soundtrackFor } from "./audio.js";
import { clipFilename } from "./naming.js";
import {
  canvasRecorder,
  taintedCanvasError,
  type ClipRecorder,
  type RecordedSound,
  type RecorderOptions,
} from "./encode.js";
import { runClip, seekTo } from "./playback.js";

/** What a cancelled video export calls itself, in one place. */
const VIDEO_EXPORT = "Video export";

export type VideoExportStage = "render" | "encode";

export interface VideoExportOptions extends RecorderOptions {
  /** Output pixels. Defaults to what the document exports a still at. */
  size?: Size;
  /**
   * The soundtrack's level, as a multiple of the source's own.
   *
   * Omitted keeps the sound exactly as it is. `0` leaves the track out of the
   * file rather than writing silence into it, which is the difference between a
   * clip with no audio and a clip with a silent audio track. See
   * `planSoundtrack`.
   */
  volume?: number;
  signal?: AbortSignal;
  /** Overrides the name the file is offered under. */
  filename?: string;
  /** Reports the clip's own seconds against its length. See `VideoExportStage`. */
  onProgress?: StepReporter<VideoExportStage>;
  /**
   * Somewhere other than a `MediaRecorder` for the frames to go — WebCodecs, a
   * WASM encoder, an upload that streams. See `ClipRecorder`.
   *
   * The soundtrack is handed over too, already at the level asked for, because
   * an encoder that writes a file has to write both halves of it.
   */
  recorder?: (canvas: HTMLCanvasElement, size: Size, sound: RecordedSound) => ClipRecorder;
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
  /** Whether the file carries the source's sound. See `volume`. */
  hasSound: boolean;
  /** The name the file is offered under, from the source's own. */
  filename: string;
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

  const selection = document.clip ?? [wholeClip(duration)];
  const length = selectionDuration(selection);
  const target = options.size ?? outputSize(document);
  assertDrawableSize(target, "video export");

  // A DOM canvas rather than an OffscreenCanvas: `captureStream` is what the
  // recorder needs and only the DOM one has it.
  const canvas = window.document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PixenError("EXPORT_FAILED", "Could not acquire a 2D context for the video export");

  // Captured before the recorder, because what the recorder is asked to write
  // depends on whether there is a soundtrack to write: WebM carries Opus, and
  // asking for it with nothing to put in it asks for a track that never comes.
  const sound = soundtrackFor(element, options.volume);
  const recorder = options.recorder
    ? options.recorder(canvas, target, sound)
    : canvasRecorder(canvas, options, sound);
  const wasPaused = element.paused;
  const startedAt = element.currentTime;

  try {
    await seekTo(element, selection[0]!.start, options.signal, VIDEO_EXPORT);

    // The first frame is painted before recording starts, so the stream has
    // something to sample the instant it does rather than a blank canvas.
    paint(context, document, element, target, resources);
    assertRecordable(context);
    options.onProgress?.({ stage: "render", loaded: 0, total: length });
    await recorder.start();

    // One recording, however many parts are kept. The seek between them costs a
    // moment of wall clock and nothing in the file: the recorder is sampling a
    // canvas, and the canvas simply goes on showing the last frame of one part
    // until the first frame of the next arrives.
    let written = 0;
    for (const [index, part] of selection.entries()) {
      if (index > 0) await seekTo(element, part.start, options.signal, VIDEO_EXPORT);
      const before = written;
      await runClip(element, part, options.signal, VIDEO_EXPORT, async (seconds) => {
        paint(context, document, element, target, resources);
        written = before + seconds;
        await recorder.frame(written);
        options.onProgress?.({ stage: "render", loaded: written, total: length });
      });
      written = before + clipDuration(part);
    }

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
      hasSound: sound.plan !== "silent",
      filename: clipFilename(document, blob.type, options.filename),
    };
  } catch (cause) {
    recorder.cancel();
    throw cause;
  } finally {
    await sound.release();
    element.pause();
    element.currentTime = startedAt;
    if (!wasPaused) void element.play().catch(() => undefined);
  }
}

/**
 * Refuses a canvas the browser will not let anyone read.
 *
 * `captureStream` is called before the first frame is drawn, on a canvas that
 * is still clean, so it does not refuse. The frame taints it, the capture track
 * goes quiet, and what came out was a 110-byte WebM header reported as a
 * successful export — a duration, a size and a type on a file no player opens,
 * because the emptiness check downstream asks whether the file is zero bytes.
 *
 * One pixel is the whole test, and it is the same question the still export's
 * redaction asks of a canvas. There it degrades to a solid fill; here there is
 * nothing to degrade to, so it says so instead.
 */
function assertRecordable(context: CanvasRenderingContext2D): void {
  try {
    context.getImageData(0, 0, 1, 1);
  } catch (cause) {
    throw taintedCanvasError(cause);
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
    { source: element, resolveResource: resources.resolve },
    { region: "crop", target },
  );
  renderScene(context, scene);
}
