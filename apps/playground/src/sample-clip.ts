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
const SAMPLE_COLOURS: readonly string[] = ["#d94040", "#3fa85f", "#3d6fd9"];

/**
 * The band in the middle — the green second.
 *
 * Derived rather than written as `{ start: 1, end: 2 }`, which was only the
 * middle because the sample happens to be three seconds long. Lengthen it and
 * that literal quietly becomes the *second* second — the same green band, so
 * nothing would look wrong.
 */
export const SAMPLE_MIDDLE_BAND = {
  start: SAMPLE_SECONDS / SAMPLE_COLOURS.length,
  end: (SAMPLE_SECONDS / SAMPLE_COLOURS.length) * 2,
};

/** The colour the sample is showing at a given moment. */
function sampleColourAt(seconds: number): string {
  const index = Math.floor(Math.max(0, seconds));
  return SAMPLE_COLOURS[Math.min(SAMPLE_COLOURS.length - 1, index)] as string;
}

export interface SampleClipOptions {
  seconds?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  /** Records a steady tone alongside the picture, for trying the soundtrack. */
  withSound?: boolean;
}

/** A plain tone: one frequency, so what comes out the other end is measurable. */
const SAMPLE_TONE_HZ = 440;

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
  const tone = options.withSound ? startTone() : null;
  if (tone) for (const track of tone.tracks) stream.addTrack(track);
  const mimeType = options.mimeType ?? (tone ? "video/webm;codecs=vp8,opus" : "video/webm;codecs=vp8");
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  // Rejecting on `onerror` as well as resolving on `onstop`: a recorder that
  // fails leaves this awaited forever otherwise, hanging the demo and any
  // browser test that asked for a sample.
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("The sample clip could not be recorded"));
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
  await tone?.stop();
  return new Blob(chunks, { type: "video/webm" });
}

/**
 * A steady tone to record alongside the picture.
 *
 * The sample is made in the browser, so its soundtrack has to be too. One
 * frequency at a constant level, because the thing worth asserting about an
 * exported soundtrack is how loud it is, and a tone makes that a number.
 */
function startTone(): { tracks: MediaStreamTrack[]; stop: () => Promise<void> } {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  oscillator.frequency.value = SAMPLE_TONE_HZ;
  oscillator.connect(destination);
  oscillator.start();
  return {
    tracks: destination.stream.getAudioTracks(),
    stop: async () => {
      oscillator.stop();
      await context.close();
    },
  };
}
