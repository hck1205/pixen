import { describe, expect, it } from "vitest";
import { MIN_CLIP_SECONDS, wholeClip } from "@pixen/core";
import { dragHandle, trackLayout, trackReadout } from "../src/trim/track.js";

/**
 * Where the two handles sit, and what dragging one means.
 *
 * The strip itself needs a browser; this is the part that does not. A handle
 * differs from a typed range in one way that matters, and it is the whole
 * reason this module exists: dragging the start past the end must stop at the
 * end rather than swap the two, because the pointer is already past it and a
 * swap makes the picture jump out from under the finger.
 */
const DURATION = 10;

describe("trackLayout", () => {
  it("puts the kept region where the clip is, as percentages", () => {
    const layout = trackLayout({ start: 2, end: 7 }, DURATION);
    expect(layout.left).toBeCloseTo(20, 6);
    // Not exact: two fractions of a duration, subtracted. A percentage that is
    // a ten-thousandth off is a percentage, and rounding it here would be
    // rounding for the sake of an equality this test does not need.
    expect(layout.width).toBeCloseTo(50, 6);
  });

  it("covers the whole strip for an untrimmed clip", () => {
    expect(trackLayout(wholeClip(DURATION), DURATION)).toEqual({ left: 0, width: 100 });
  });
});

describe("dragHandle", () => {
  const clip = { start: 2, end: 7 };

  it("moves the handle that was dragged and leaves the other one", () => {
    expect(dragHandle(clip, DURATION, "start", 0.4)).toEqual({ start: 4, end: 7 });
    expect(dragHandle(clip, DURATION, "end", 0.9)).toEqual({ start: 2, end: 9 });
  });

  it("stops the start at the end rather than swapping them", () => {
    const dragged = dragHandle(clip, DURATION, "start", 0.95);
    expect(dragged.start).toBeLessThan(dragged.end);
    expect(dragged.end).toBe(7);
    expect(dragged.end - dragged.start).toBeCloseTo(MIN_CLIP_SECONDS, 6);
  });

  it("stops the end at the start, the same way round", () => {
    const dragged = dragHandle(clip, DURATION, "end", 0.05);
    expect(dragged.start).toBe(2);
    expect(dragged.end - dragged.start).toBeCloseTo(MIN_CLIP_SECONDS, 6);
  });

  it("holds a handle inside the source however far the pointer went", () => {
    expect(dragHandle(clip, DURATION, "end", 5).end).toBe(DURATION);
    expect(dragHandle(clip, DURATION, "start", -3).start).toBe(0);
  });
});

describe("trackReadout", () => {
  it("says where the clip starts, ends, and how long the source is", () => {
    expect(trackReadout({ start: 1, end: 2.5 }, 3)).toBe("1.0s – 2.5s / 3.0s");
  });
});
