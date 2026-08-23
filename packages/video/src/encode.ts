/**
 * Turning drawn frames into a file.
 *
 * The one Pixen ships records a canvas in real time, because that is what a
 * browser gives you for nothing: `captureStream` plus `MediaRecorder` needs no
 * dependency and works everywhere the editor already does. It also has two
 * costs that a host has to know before choosing it, and neither is a detail:
 *
 * - **It runs at wall-clock speed.** A thirty-second clip takes thirty seconds,
 *   because the frames are recorded as they are painted. There is no way to ask
 *   it to go faster.
 * - **It writes WebM.** MP4 is not on offer — measured, `MediaRecorder` here
 *   supports VP8 and VP9 in WebM and refuses `video/mp4` and H.264 outright.
 *
 * `WebCodecs` is the way out of both, and it is not always there: in the
 * Chromium this repository tests against, `VideoEncoder` is undefined even with
 * the flags on. So it is not what Pixen depends on, and `VideoEncoder` is
 * exactly what a host would reach for through this seam.
 */
import { PixenError } from "@pixen/core";

/**
 * Somewhere for drawn frames to go.
 *
 * A recorder is handed the canvas being drawn into and told when the clip
 * starts and stops; what it does in between is its own business. That shape
 * suits a realtime recorder and a frame-by-frame encoder equally: the first
 * subscribes to the canvas, the second reads it on every `frame()`.
 */
export interface ClipRecorder {
  /** Called once, before the first frame is painted. */
  start(): void | Promise<void>;
  /** Called after each frame is painted, with where it sits in the clip. */
  frame(seconds: number): void | Promise<void>;
  /** Called once. Resolves with the finished file. */
  finish(): Promise<Blob>;
  /** Called instead of `finish` when the export is called off. */
  cancel(): void;
}

export interface RecorderOptions {
  /** Frames per second asked of the stream. The browser may give fewer. */
  frameRate?: number;
  /** Bits per second for the video track. Omitted lets the browser choose. */
  bitrate?: number;
  /** Overrides the container and codec. Must be one `MediaRecorder` supports. */
  mimeType?: string;
}

/**
 * In preference order, most to least wanted.
 *
 * VP9 first because it is the better codec at the same bitrate; VP8 because it
 * is the one every browser with `MediaRecorder` has had for longest. The bare
 * `video/webm` is the last resort that lets the browser pick for itself.
 */
const CANDIDATE_TYPES: readonly string[] = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

const DEFAULT_FRAME_RATE = 30;

/** The container and codec this browser will actually write, or `null`. */
export function supportedRecordingType(preferred?: string): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const wanted = preferred ? [preferred] : CANDIDATE_TYPES;
  return wanted.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Records a canvas as it is painted.
 *
 * `captureStream` hands over a track that samples the canvas, so the recorder
 * never sees the frames directly — it sees whatever the canvas held when the
 * browser looked. That is why the exporter paints and then waits rather than
 * painting as fast as it can: a frame drawn and overwritten before the next
 * sample is a frame that never reaches the file.
 */
/**
 * What a canvas nobody may read means for a recording.
 *
 * A video from another origin with no `Access-Control-Allow-Origin` taints the
 * canvas its frames are drawn into, and that is the most likely way a real
 * deployment fails, because a clip usually lives on a CDN. It is not a
 * degradation: the still export merely loses the effects that read pixels back,
 * while a recording cannot happen at all.
 *
 * Two places find out — `captureStream` refuses an already-unclean canvas
 * outright, and a canvas that was clean when the stream started goes quiet the
 * moment the first frame taints it — so what they say is written once. The
 * remedy needs both of its halves, so the message carries both.
 */
export function taintedCanvasError(cause?: unknown): PixenError {
  return new PixenError(
    "CORS_ERROR",
    "The video is from another origin, so its frames cannot be recorded. Serve it with " +
      '`Access-Control-Allow-Origin` and open it with `crossOrigin: "anonymous"`.',
    ...(cause === undefined ? [] : [{ cause }]),
  );
}

/** Starts the stream, or says why it could not. */
function captureCanvas(canvas: HTMLCanvasElement, frameRate: number): MediaStream {
  try {
    return canvas.captureStream(frameRate);
  } catch (cause) {
    throw taintedCanvasError(cause);
  }
}

export function canvasRecorder(canvas: HTMLCanvasElement, options: RecorderOptions = {}): ClipRecorder {
  const mimeType = supportedRecordingType(options.mimeType);
  if (mimeType === null) {
    throw new PixenError("UNSUPPORTED_FORMAT", "This browser cannot record video from a canvas", {
      details: { requested: options.mimeType ?? CANDIDATE_TYPES },
    });
  }

  const stream = captureCanvas(canvas, options.frameRate ?? DEFAULT_FRAME_RATE);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    ...(options.bitrate === undefined ? {} : { videoBitsPerSecond: options.bitrate }),
  });

  const chunks: Blob[] = [];
  let failure: PixenError | null = null;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  // Attached now rather than in `finish`, which is the whole point. A recorder
  // that fails mid-clip — a track ending, an encoder fault — goes `inactive`
  // with nobody listening, and `finish` would then find it already stopped and
  // hand back whatever partial chunks existed as though the export had worked.
  // A zero-byte file reported as success is the worst outcome an export API has.
  recorder.onerror = () => {
    failure ??= new PixenError("EXPORT_FAILED", "The recorder failed part way through the clip");
  };

  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    start: () => recorder.start(),
    frame: () => {
      // Nothing to do: the stream is already watching the canvas.
    },
    finish: () =>
      new Promise<Blob>((resolve, reject) => {
        const settle = (): void => {
          stopTracks();
          if (failure) {
            reject(failure);
            return;
          }
          const blob = new Blob(chunks, { type: mimeType });
          // Nothing came out. Better to say so than to hand back a file that
          // opens as nothing.
          if (blob.size === 0) {
            reject(new PixenError("EXPORT_FAILED", "The recorder produced no video"));
            return;
          }
          resolve(blob);
        };

        recorder.onstop = settle;
        recorder.onerror = () => {
          failure ??= new PixenError("EXPORT_FAILED", "Recording the video failed");
          settle();
        };

        // Already stopped, and we never asked it to: the recorder gave up on its
        // own, which is never good news even when some chunks arrived.
        if (recorder.state === "inactive") {
          failure ??= new PixenError("EXPORT_FAILED", "The recorder stopped before the clip did");
          settle();
          return;
        }

        // `stop` is what flushes the last chunk, so the blob is only whole once
        // `onstop` has run — which is why this is a promise and not a return.
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== "inactive") recorder.stop();
      stopTracks();
      chunks.length = 0;
    },
  };
}
