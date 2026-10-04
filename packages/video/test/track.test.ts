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
    expect(trackReadout([{ start: 1, end: 2.5 }], 3)).toBe("1.0s – 2.5s / 3.0s");
  });

  it("names every kept part, and then how much film that adds up to", () => {
    // The total is the length of the file that comes out, and it is not the
    // last part's end minus the first part's start.
    expect(
      trackReadout(
        [
          { start: 0, end: 1 },
          { start: 2, end: 3 },
        ],
        3,
      ),
    ).toBe("0.0s – 1.0s, 2.0s – 3.0s (2.0s) / 3.0s");
  });
});

/**
 * `clampClip` takes time off the end when a clip is too long, because it does
 * not know which end anyone touched. A drag does, so the handle being dragged
 * is the one that stops — a start handle that quietly pulled the far end along
 * would be moving a part of the clip nobody had hold of.
 */
describe("a handle against a length bound", () => {
  const minute = 60;

  it("stops the start handle rather than dragging the end along with it", () => {
    const clip = { start: 20, end: 30 };
    const dragged = dragHandle(clip, minute, "start", 0, { max: 10 });
    expect(dragged.end).toBe(30);
    expect(dragged.start).toBe(20);
  });

  it("stops the end handle at the ceiling, wherever the pointer went", () => {
    const dragged = dragHandle({ start: 20, end: 30 }, minute, "end", 1, { max: 10 });
    expect(dragged).toEqual({ start: 20, end: 30 });
  });

  it("stops a handle closing in past the floor, holding the other", () => {
    const dragged = dragHandle({ start: 20, end: 40 }, minute, "end", 20 / minute, { min: 5 });
    expect(dragged).toEqual({ start: 20, end: 25 });
  });

  it("lets a handle move freely while the clip stays inside its bounds", () => {
    const dragged = dragHandle({ start: 20, end: 40 }, minute, "start", 25 / minute, { min: 5, max: 30 });
    expect(dragged.start).toBeCloseTo(25, 6);
    expect(dragged.end).toBe(40);
  });

  it("behaves as it always did when no bound is given", () => {
    const dragged = dragHandle({ start: 20, end: 40 }, minute, "start", 0);
    expect(dragged.start).toBe(0);
    expect(dragged.end).toBe(40);
  });
});
