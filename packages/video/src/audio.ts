/**
 * The clip's soundtrack, on the way out.
 *
 * Recording a canvas records a canvas: `captureStream` gives video and nothing
 * else, so every exported clip came back silent, whatever the source had. That
 * is not "no audio editing", it is losing the soundtrack without saying so.
 *
 * The element's own captured stream is where the sound comes from — it carries
 * a live audio track even while the element is muted, which it has to be,
 * because a browser will not play an unmuted video nobody clicked on. Taking it
 * from there rather than from an element source node also leaves the host's
 * element alone: nothing is re-routed, and a second export still works.
 */

/** What is done with the sound, decided before anything is wired up. */
export type SoundtrackPlan =
  /** No track in the output: asked for silence, or there was none to keep. */
  | "silent"
  /** The source's own track, untouched — no graph, no resampling, no loss. */
  | "asIs"
  /** Through a gain stage, because the level asked for is not the one it has. */
  | "adjusted";

/**
 * `volume` is a multiplier on the source's own level: 1 keeps it, 0 drops the
 * track entirely rather than writing silence, and anything between attenuates.
 * Above 1 amplifies, which is allowed and clips like anything else would.
 *
 * A volume that is not a number at all is treated as 1. Losing a soundtrack to
 * a typo is the failure this whole module exists to stop, so the fallback is
 * the one that keeps it.
 */
export function planSoundtrack(volume: number | undefined, hasSound: boolean): SoundtrackPlan {
  if (!hasSound) return "silent";
  if (volume === undefined || !Number.isFinite(volume)) return "asIs";
  if (volume <= 0) return "silent";
  return volume === 1 ? "asIs" : "adjusted";
}

/** The tracks to record, and how to let go of whatever produced them. */
export interface Soundtrack {
  readonly tracks: readonly MediaStreamTrack[];
  readonly plan: SoundtrackPlan;
  /** Closes the audio graph, if the plan needed one. Always safe to call. */
  release(): Promise<void>;
}

const SILENT: Soundtrack = { tracks: [], plan: "silent", release: async () => undefined };

/**
 * Captures the element's sound at the level asked for.
 *
 * The gain stage is built only when the level differs from the source's own, so
 * the ordinary export re-records the original track rather than a resampled
 * copy of it.
 */
export function soundtrackFor(element: HTMLVideoElement, volume: number | undefined): Soundtrack {
  const captured = capture(element);
  const source = captured?.getAudioTracks() ?? [];
  const plan = planSoundtrack(volume, source.length > 0);

  if (plan === "silent") {
    for (const track of source) track.stop();
    return SILENT;
  }
  if (plan === "asIs") return { tracks: source, plan, release: async () => undefined };

  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = volume as number;
  const destination = context.createMediaStreamDestination();
  context.createMediaStreamSource(new MediaStream(source)).connect(gain);
  gain.connect(destination);

  return {
    tracks: destination.stream.getAudioTracks(),
    plan,
    release: async () => {
      for (const track of source) track.stop();
      await context.close();
    },
  };
}

/**
 * Media Capture from DOM Elements, which this TypeScript lib does not carry on
 * media elements yet. Declared as narrowly as it is used rather than widened
 * globally, so nothing else starts depending on an ambient guess.
 */
interface CapturableMedia {
  captureStream?: () => MediaStream;
}

/**
 * A source that cannot be read has no sound to offer either.
 *
 * `captureStream` throws on an element the page is not allowed to read — the
 * same cross-origin wall the frames hit. The frames report that, in one place
 * and by name, so here it is only a reason to have no soundtrack.
 */
function capture(element: HTMLVideoElement): MediaStream | null {
  const capturable = element as HTMLVideoElement & CapturableMedia;
  if (!capturable.captureStream) return null;
  try {
    return capturable.captureStream();
  } catch {
    return null;
  }
}
