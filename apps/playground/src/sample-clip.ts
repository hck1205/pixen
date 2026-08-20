/**
 * A clip to try the editor on, made in the browser rather than shipped as a file.
 *
 * It is a second of red, a second of green and a second of blue, which is not
 * decoration: it means you can see at a glance whether a trim took the part you
 * asked for, and a test can assert the same thing by reading one pixel.
 *
 * The corner counter is the part that looks pointless and is not. A canvas
 * stream emits a frame only when the canvas *changes*, so painting one flat
 * colour for a whole second produces one frame for that second — measured, a
 * three-second recording came out 658 bytes long and claimed to last two. A
 * pixel that differs every time keeps the frames coming.
 */
export const SAMPLE_SECONDS = 3;
const SAMPLE_WIDTH = 480;
const SAMPLE_HEIGHT = 270;
const SAMPLE_FRAME_RATE = 30;

/** One per second, so the second something came from is readable off the picture. */
export const SAMPLE_COLOURS: readonly string[] = ["#d94040", "#3fa85f", "#3d6fd9"];

/** The colour the sample is showing at a given moment. */
export function sampleColourAt(seconds: number): string {
  const index = Math.floor(Math.max(0, seconds));
  return SAMPLE_COLOURS[Math.min(SAMPLE_COLOURS.length - 1, index)] as string;
}

export interface SampleClipOptions {
  seconds?: number;
  width?: number;
  height?: number;
  mimeType?: string;
}

/**
 * Records a sample clip in real time, which is the only speed there is.
 *
 * Three seconds takes three seconds. That is the same cost the exporter pays,
 * for the same reason, so a demo that made its own sample instantly would be
 * quietly misrepresenting what the export does.
 */
export async function recordSampleClip(options: SampleClipOptions = {}): Promise<Blob> {
  const seconds = options.seconds ?? SAMPLE_SECONDS;
  const width = options.width ?? SAMPLE_WIDTH;
  const height = options.height ?? SAMPLE_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not acquire a 2D context for the sample clip");

  const stream = canvas.captureStream(SAMPLE_FRAME_RATE);
  const mimeType = options.mimeType ?? "video/webm;codecs=vp8";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const startedAt = performance.now();
  recorder.start();
  let painted = 0;

  await new Promise<void>((done) => {
    const tick = (): void => {
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= seconds) {
        done();
        return;
      }
      context.fillStyle = sampleColourAt(elapsed);
      context.fillRect(0, 0, width, height);

      context.fillStyle = "#ffffff";
      context.font = `${Math.round(height / 5)}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(`${elapsed.toFixed(1)}s`, width / 2, height / 2);

      // See the note at the top: a frame identical to the last one is not sent.
      context.fillStyle = `rgb(${painted % 256}, 0, 0)`;
      context.fillRect(0, 0, 1, 1);
      painted += 1;
      requestAnimationFrame(tick);
    };
    tick();
  });

  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  return new Blob(chunks, { type: "video/webm" });
}
