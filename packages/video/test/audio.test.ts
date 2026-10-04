import { describe, expect, it } from "vitest";
import { planSoundtrack } from "../src/audio.js";

/**
 * Recording a canvas records a canvas, so every exported clip came back silent
 * whatever the source had — measured: one audio track in, none out. That is not
 * "no audio editing", it is losing the soundtrack without saying so.
 *
 * What is decided here is only what to do with the sound; the wiring is next
 * door, and needs a browser.
 */
describe("what happens to the sound", () => {
  it("keeps the source's own track when no level is asked for", () => {
    expect(planSoundtrack(undefined, true)).toBe("asIs");
  });

  it("keeps it untouched at the source's own level, rather than through a graph", () => {
    // A gain stage of exactly 1 would resample the track for no reason.
    expect(planSoundtrack(1, true)).toBe("asIs");
  });

  it("drops the track rather than writing silence into it", () => {
    // A file with no audio track and a file with a silent one are different
    // things to everything downstream, and zero means the first.
    expect(planSoundtrack(0, true)).toBe("silent");
    expect(planSoundtrack(-1, true)).toBe("silent");
  });

  it("has nothing to keep when the source has no sound", () => {
    for (const volume of [undefined, 0, 0.5, 1, 2]) {
      expect(planSoundtrack(volume, false), String(volume)).toBe("silent");
    }
  });

  it("goes through a gain stage for any other level, quieter or louder", () => {
    expect(planSoundtrack(0.5, true)).toBe("adjusted");
    expect(planSoundtrack(2, true)).toBe("adjusted");
  });

  it("keeps the sound when the level is not a number at all", () => {
    // Losing a soundtrack to a typo is the failure this module exists to stop,
    // so the fallback is the one that keeps it.
    expect(planSoundtrack(Number.NaN, true)).toBe("asIs");
    expect(planSoundtrack(Number.POSITIVE_INFINITY, true)).toBe("asIs");
  });
});
