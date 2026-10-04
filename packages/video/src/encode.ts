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
import { PixenError, type Size } from "@pixen/core";

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
  /**
   * Bits per second for the sound, when there is any.
   *
   * Its own number because the two are not one budget: a talk wants the words
   * intelligible and the picture small, and a silent screen recording wants the
   * opposite. Omitted lets the browser choose, as `bitrate` does.
   */
  audioBitrate?: number;
  /** Overrides the container and codec. Must be one `MediaRecorder` supports. */
  mimeType?: string;
}

/** What goes into the file besides the canvas. See `soundtrackFor`. */
export interface RecordedSound {
  readonly tracks: readonly MediaStreamTrack[];
}

/**
 * In preference order, most to least wanted.
 *
 * VP9 first because it is the better codec at the same bitrate; VP8 because it
 * is the one every browser with `MediaRecorder` has had for longest. The bare
 * `video/webm` is the last resort that lets the browser pick for itself.
 *
 * A clip with sound asks for the same picture codecs paired with Opus, which is
 * the only audio codec WebM carries. Asking for it when there is no sound to
 * write would be asking the browser for a track that never arrives.
 */
const SILENT_TYPES: readonly string[] = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const SOUND_TYPES: readonly string[] = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

const DEFAULT_FRAME_RATE = 30;

/**
 * The container and codec this browser will actually write, or `null`.
 *
 * `withSound` picks which list is tried; a preferred type is taken as given and
 * is the caller's business to get right.
 */
export function supportedRecordingType(preferred?: string, withSound = false): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const wanted = preferred ? [preferred] : withSound ? SOUND_TYPES : SILENT_TYPES;
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

export function canvasRecorder(
  canvas: HTMLCanvasElement,
  options: RecorderOptions = {},
  sound: RecordedSound = { tracks: [] },
): ClipRecorder {
  const withSound = sound.tracks.length > 0;
  const mimeType = supportedRecordingType(options.mimeType, withSound);
  if (mimeType === null) {
    throw new PixenError("UNSUPPORTED_FORMAT", "This browser cannot record video from a canvas", {
      details: { requested: options.mimeType ?? (withSound ? SOUND_TYPES : SILENT_TYPES) },
    });
  }

  const stream = captureCanvas(canvas, options.frameRate ?? DEFAULT_FRAME_RATE);
  // Added to the canvas's own stream rather than recorded separately: one
  // recorder writing one file is what keeps the two in step.
  for (const track of sound.tracks) stream.addTrack(track);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    ...(options.bitrate === undefined ? {} : { videoBitsPerSecond: options.bitrate }),
    ...(options.audioBitrate === undefined || !withSound ? {} : { audioBitsPerSecond: options.audioBitrate }),
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

/**
 * The first encoder that can be built, of several.
 *
 * A browser that has `VideoEncoder` should use it and one that has not should
 * still export something, and picking between them is a decision a host should
 * not have to write twice. Each factory is tried in turn; the first that
 * returns without throwing is the one that records.
 *
 * ```js
 * exportClip(document, element, resources, {
 *   recorder: recorderChain(myWebCodecsEncoder, canvasRecorder),
 * });
 * ```
 *
 * The last factory is the fallback and its failure is the chain's: if nothing
 * can record, the reason a host sees is the reason the *last* one gave, which
 * is the one that was meant to work everywhere.
 */
export function recorderChain(
  ...factories: ReadonlyArray<(canvas: HTMLCanvasElement, size: Size, sound: RecordedSound) => ClipRecorder>
): (canvas: HTMLCanvasElement, size: Size, sound: RecordedSound) => ClipRecorder {
  if (factories.length === 0) {
    throw new PixenError("INVALID_STATE", "A recorder chain needs at least one encoder to try");
  }
  return (canvas, size, sound) => {
    for (const [index, build] of factories.entries()) {
      const last = index === factories.length - 1;
      if (last) return build(canvas, size, sound);
      try {
        return build(canvas, size, sound);
      } catch {
        // Try the next one. The last one's failure is the one that is reported,
        // because it is the one that was supposed to work anywhere.
      }
    }
    // Unreachable: the loop returns or throws on its final pass.
    throw new PixenError("EXPORT_FAILED", "No encoder in the chain could record");
  };
}
