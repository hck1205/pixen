import { describe, expect, it } from "vitest";
import {
  clampClip,
  clipDuration,
  clipFractions,
  clipFromFractions,
  clipLimits,
  clampSelection,
  selectionDuration,
  subtractRange,
  clipTimeToSource,
  commands,
  createDocument,
  MIN_CLIP_SECONDS,
  migrateDocument,
  SCHEMA_VERSION,
  validateDocument,
  wholeClip,
  type EditorDocument,
} from "@pixen/core";

const DURATION = 10;
const FRAME: { resourceId: string; width: number; height: number } = {
  resourceId: "res_1",
  width: 640,
  height: 480,
};

/** A source that runs. */
function movingDocument(): EditorDocument {
  return createDocument({ ...FRAME, duration: DURATION });
}

/** A photograph: no duration at all, which is not the same as a duration of zero. */
function stillDocument(): EditorDocument {
  return createDocument(FRAME);
}

const stored = (document: EditorDocument): Record<string, unknown> =>
  JSON.parse(JSON.stringify(document)) as Record<string, unknown>;

describe("clampClip", () => {
  it("leaves a range that is already inside the source", () => {
    expect(clampClip({ start: 2, end: 5 }, DURATION)).toEqual({ start: 2, end: 5 });
  });

  it("brings both ends inside the source", () => {
    expect(clampClip({ start: -3, end: 99 }, DURATION)).toEqual({ start: 0, end: DURATION });
  });

  it("sorts a range dragged inside out rather than refusing it", () => {
    // Dragging the left handle past the right one is a gesture people make, and
    // an inverted selection is what they mean by it.
    expect(clampClip({ start: 7, end: 3 }, DURATION)).toEqual({ start: 3, end: 7 });
  });

  it("grows a range too short to be one", () => {
    const clip = clampClip({ start: 4, end: 4 }, DURATION);
    expect(clipDuration(clip)).toBeCloseTo(MIN_CLIP_SECONDS, 10);
    expect(clip.start).toBe(4);
  });

  it("grows backwards at the very end, where there is no room ahead", () => {
    const clip = clampClip({ start: DURATION, end: DURATION }, DURATION);
    expect(clip.end).toBe(DURATION);
    expect(clipDuration(clip)).toBeCloseTo(MIN_CLIP_SECONDS, 10);
  });

  it("survives a source with no length worth speaking of", () => {
    const clip = clampClip({ start: 0, end: 0 }, 0);
    expect(clip.end).toBeGreaterThan(clip.start);
  });
});

describe("clip arithmetic", () => {
  it("is the whole source when nothing has been trimmed", () => {
    expect(wholeClip(DURATION)).toEqual({ start: 0, end: DURATION });
  });

  it("maps the clip's own timeline onto the source's", () => {
    // An exported file starts at zero; the source it came from does not.
    const clip = { start: 3, end: 8 };
    expect(clipTimeToSource(clip, 0)).toBe(3);
    expect(clipTimeToSource(clip, 2)).toBe(5);
  });

  it("does not run past the end of the clip", () => {
    expect(clipTimeToSource({ start: 3, end: 8 }, 99)).toBe(8);
  });

  it("reads out as fractions for a timeline to lay out", () => {
    expect(clipFractions({ start: 2.5, end: 7.5 }, DURATION)).toEqual({ start: 0.25, end: 0.75 });
  });

  it("reads back in from a timeline, clamped on the way", () => {
    expect(clipFromFractions(0.25, 0.75, DURATION)).toEqual({ start: 2.5, end: 7.5 });
    expect(clipFromFractions(-1, 2, DURATION)).toEqual({ start: 0, end: DURATION });
  });
});

describe("setClip", () => {
  it("clamps what it is given, because it usually came from a handle", () => {
    const document = commands.setClip(movingDocument(), { start: -5, end: 99 });
    expect(document.clip).toEqual([{ start: 0, end: DURATION }]);
  });

  it("clears back to the whole source", () => {
    const trimmed = commands.setClip(movingDocument(), { start: 1, end: 2 });
    expect(commands.setClip(trimmed, null).clip).toBeNull();
  });

  it("refuses to give a still picture a clip", () => {
    // A photograph has no duration, so there is no honest range to store — and
    // one stored anyway would be a number the renderer could never satisfy.
    expect(commands.setClip(stillDocument(), { start: 1, end: 2 }).clip).toBeNull();
  });
});

describe("the clip in the document", () => {
  it("is absent on a new document, which is what a still picture is", () => {
    expect(stillDocument().clip).toBeNull();
  });

  it("is cleared by a reset, because a trim is an edit like any other", () => {
    const trimmed = commands.setClip(movingDocument(), { start: 1, end: 2 });
    expect(commands.resetEdits(trimmed).clip).toBeNull();
  });

  it("round-trips through parse", () => {
    const trimmed = commands.setClip(movingDocument(), { start: 1, end: 2 });
    const parsed = validateDocument(stored(trimmed));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.clip).toEqual([{ start: 1, end: 2 }]);
    expect(parsed.value.source.duration).toBe(DURATION);
  });

  it("refuses a stored clip that runs backwards", () => {
    // Sorted for a gesture, rejected for a document: an inverted range in a
    // saved file did not come from a drag, and repairing it would hide whatever
    // wrote it.
    const trimmed = commands.setClip(movingDocument(), { start: 1, end: 2 });
    const inverted = { ...stored(trimmed), clip: [{ start: 5, end: 2 }] };
    expect(validateDocument(inverted).ok).toBe(false);
  });

  it("opens a document saved before clips existed", () => {
    const v4: Record<string, unknown> = { ...stored(movingDocument()), schemaVersion: 4 };
    delete v4.clip;
    const migrated = migrateDocument(v4);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated).toMatchObject({ clip: null });
  });
});

/**
 * A host that accepts clips has rules about how long one may be — an advert
 * slot, an upload limit, a format that wants at least a few seconds. The limit
 * is on the *kept* length rather than on what may be loaded: a long source
 * opens as it always did, and it is the clip that is held inside the bound.
 */
describe("how long a clip is allowed to be", () => {
  const minute = 60;

  it("pulls a clip that is too long in from its end", () => {
    // The end is the part a length limit is about; a drag knows better and says
    // so separately, by stopping the handle that moved.
    expect(clampClip({ start: 10, end: 50 }, minute, { max: 12 })).toEqual({ start: 10, end: 22 });
  });

  it("grows a clip that is too short towards its end", () => {
    expect(clampClip({ start: 10, end: 11 }, minute, { min: 5 })).toEqual({ start: 10, end: 15 });
  });

  it("grows it backwards instead when there is no room ahead", () => {
    expect(clampClip({ start: 58, end: 59 }, minute, { min: 5 })).toEqual({ start: 55, end: 60 });
  });

  it("leaves a clip already inside both bounds exactly as it was", () => {
    const inside = { start: 10, end: 20 };
    expect(clampClip(inside, minute, { min: 5, max: 30 })).toEqual(inside);
  });

  it("cannot honour a floor longer than the source, and says so by keeping all of it", () => {
    // A ten-second minimum against a three-second source is a rule that cannot
    // be met. The whole source is the honest answer; a range running off the
    // end is not.
    expect(clampClip({ start: 1, end: 2 }, 3, { min: 10 })).toEqual({ start: 0, end: 3 });
  });

  it("never lets a ceiling sit below the floor", () => {
    const { floor, ceiling } = clipLimits(minute, { min: 20, max: 5 });
    expect(ceiling).toBe(floor);
    expect(clipDuration(clampClip({ start: 0, end: 60 }, minute, { min: 20, max: 5 }))).toBe(20);
  });

  it("keeps the floor it has always had when no bound is given", () => {
    expect(clipDuration(clampClip({ start: 5, end: 5 }, minute))).toBeCloseTo(MIN_CLIP_SECONDS, 10);
  });

  it("cannot clear a trim back to a whole source the ceiling has refused", () => {
    // `null` means the whole source, and a ceiling says the whole source is not
    // something this host will take. Leaving no clip would let the document
    // hold a state the host had already ruled out, and the export would write
    // it — so clearing leaves the longest clip the rule allows.
    const moving = { ...createDocument({ resourceId: "res_1", width: 8, height: 8 }), source: { resourceId: "res_1", width: 8, height: 8, duration: 60 } };
    expect(commands.setClip({ ...moving, clip: [{ start: 10, end: 20 }] }, null, { max: 10 }).clip).toEqual([
      { start: 0, end: 10 },
    ]);
  });

  it("clears it outright when no ceiling stands in the way", () => {
    const moving = { ...createDocument({ resourceId: "res_1", width: 8, height: 8 }), source: { resourceId: "res_1", width: 8, height: 8, duration: 60 } };
    expect(commands.setClip({ ...moving, clip: [{ start: 10, end: 20 }] }, null, { max: 999 }).clip).toBeNull();
    expect(commands.setClip({ ...moving, clip: [{ start: 10, end: 20 }] }, null).clip).toBeNull();
  });

  it("applies the bounds to a range read off a timeline too", () => {
    // The strip hands over fractions; the rule cannot live in only one of the
    // two doors into the same value.
    expect(clipFromFractions(0, 1, minute, { max: 10 })).toEqual({ start: 0, end: 10 });
  });
});

/**
 * One range was the whole of trimming until it was not: a talk with two good
 * answers in it, an interview with the pauses taken out, a reel of three
 * moments. What is stored is what is *kept*, because the kept parts are what
 * the exported file is made of.
 */
describe("keeping more than one part", () => {
  const minute = 60;

  it("keeps the parts it is given, in order", () => {
    expect(
      clampSelection(
        [
          { start: 30, end: 40 },
          { start: 5, end: 10 },
        ],
        minute,
      ),
    ).toEqual([
      { start: 5, end: 10 },
      { start: 30, end: 40 },
    ]);
  });

  it("merges parts that touch or overlap rather than refusing them", () => {
    // Two ranges that overlap describe one kept stretch, which is what the
    // export would write anyway. Dragging one segment's edge into its
    // neighbour is a gesture people make.
    expect(
      clampSelection(
        [
          { start: 5, end: 20 },
          { start: 15, end: 30 },
        ],
        minute,
      ),
    ).toEqual([{ start: 5, end: 30 }]);
  });

  it("adds up to the length of the file that comes out", () => {
    // Not the last part's end minus the first part's start, which is the
    // mistake a single range invites.
    const selection = [
      { start: 0, end: 5 },
      { start: 50, end: 55 },
    ];
    expect(selectionDuration(selection)).toBe(10);
  });

  it("spends a ceiling across the parts in order, cutting the one that crosses it", () => {
    // A host asking for thirty seconds means thirty seconds of film, however
    // many pieces it arrives in.
    const kept = clampSelection(
      [
        { start: 0, end: 8 },
        { start: 20, end: 28 },
        { start: 40, end: 48 },
      ],
      minute,
      { max: 12 },
    );
    expect(kept).toEqual([
      { start: 0, end: 8 },
      { start: 20, end: 24 },
    ]);
    expect(selectionDuration(kept)).toBe(12);
  });

  it("falls back to the whole source rather than keeping nothing at all", () => {
    expect(clampSelection([], minute)).toEqual([{ start: 0, end: minute }]);
  });

  it("stores what a v9 document meant, as a list of one", () => {
    const before = { ...stored(commands.setClip(movingDocument(), { start: 1, end: 2 })), schemaVersion: 9, clip: { start: 1, end: 2 } };
    const migrated = migrateDocument(before);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.clip).toEqual([{ start: 1, end: 2 }]);
    expect(validateDocument(migrated).ok).toBe(true);
  });

  it("leaves a v9 document with no trim alone", () => {
    const before = { ...stored(movingDocument()), schemaVersion: 9, clip: null };
    expect(migrateDocument(before).clip).toBeNull();
  });

  it("refuses a stored selection whose parts overlap", () => {
    // Merged for a gesture, rejected for a document: a saved file with
    // overlapping parts did not come from a drag.
    const overlapping = {
      ...stored(commands.setClip(movingDocument(), { start: 1, end: 2 })),
      clip: [
        { start: 1, end: 2 },
        { start: 1.5, end: 2.5 },
      ],
    };
    expect(validateDocument(overlapping).ok).toBe(false);
  });

  it("refuses a stored selection with nothing in it", () => {
    const empty = { ...stored(commands.setClip(movingDocument(), { start: 1, end: 2 })), clip: [] };
    expect(validateDocument(empty).ok).toBe(false);
  });
});

/**
 * The gesture that makes several kept parts out of one: mark the pause, the
 * stumble, the dead air, and take it out.
 */
describe("cutting a stretch out of what is kept", () => {
  const minute = 60;
  const whole = [{ start: 0, end: minute }];

  it("turns one part into two when the cut falls inside it", () => {
    expect(subtractRange(whole, { start: 20, end: 30 }, minute)).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 60 },
    ]);
  });

  it("shortens a part the cut only reaches into", () => {
    expect(subtractRange(whole, { start: 50, end: 99 }, minute)).toEqual([{ start: 0, end: 50 }]);
  });

  it("drops a part the cut covers entirely", () => {
    const two = [
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ];
    expect(subtractRange(two, { start: 18, end: 32 }, minute)).toEqual([{ start: 0, end: 10 }]);
  });

  it("leaves a part the cut misses exactly as it was", () => {
    expect(subtractRange([{ start: 0, end: 10 }], { start: 20, end: 30 }, minute)).toEqual([{ start: 0, end: 10 }]);
  });

  it("sorts a cut that arrived backwards, the way a drag can produce one", () => {
    expect(subtractRange(whole, { start: 30, end: 20 }, minute)).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 60 },
    ]);
  });

  it("hands back what it was given rather than nothing when the cut takes everything", () => {
    // A clip has to be something. An empty selection is not a shorter film, it
    // is no film — and the caller can see nothing happened because what came
    // back is what went in.
    expect(subtractRange(whole, { start: 0, end: minute }, minute)).toEqual(whole);
  });

  it("leaves no sliver too short to be a clip", () => {
    const cut = subtractRange(whole, { start: MIN_CLIP_SECONDS / 2, end: 30 }, minute);
    expect(cut).toEqual([{ start: 30, end: 60 }]);
  });
});
