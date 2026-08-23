import { describe, expect, it } from "vitest";
import {
  clampClip,
  clipDuration,
  clipFractions,
  clipFromFractions,
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
    expect(document.clip).toEqual({ start: 0, end: DURATION });
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
    expect(parsed.value.clip).toEqual({ start: 1, end: 2 });
    expect(parsed.value.source.duration).toBe(DURATION);
  });

  it("refuses a stored clip that runs backwards", () => {
    // Sorted for a gesture, rejected for a document: an inverted range in a
    // saved file did not come from a drag, and repairing it would hide whatever
    // wrote it.
    const trimmed = commands.setClip(movingDocument(), { start: 1, end: 2 });
    const inverted = { ...stored(trimmed), clip: { start: 5, end: 2 } };
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
